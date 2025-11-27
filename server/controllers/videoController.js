import { supabase } from '../config/supabase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Set FFmpeg path for both development and production
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const generateThumbnail = (videoPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['00:00:02'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '640x360'
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err));
  });
};
const getVideoDuration = (videoPath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        resolve(0);
      } else {
        resolve(Math.floor(metadata.format.duration || 0));
      }
    });
  });
};
export const uploadVideo = async (req, res) => {
  try {
    const { title, description, category, tags } = req.body;
    const videoFile = req.files?.video?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];
    if (!title || !videoFile) {
      return res.status(400).json({ error: 'Title and video file are required' });
    }
    // Generate unique filenames
    const videoFilename = `video-${Date.now()}${path.extname(videoFile.originalname)}`;
    const thumbnailFilename = `thumb-${Date.now()}.png`;
    // Get video duration
    const duration = await getVideoDuration(videoFile.path);
    console.log('Video duration:', duration);
    // Upload video to Supabase Storage
    const videoBuffer = fs.readFileSync(videoFile.path);
    const { data: videoData, error: videoError } = await supabase.storage
      .from('videos')
      .upload(videoFilename, videoBuffer, {
        contentType: videoFile.mimetype,
        upsert: false
      });
    if (videoError) {
      console.error('Video upload error:', videoError);
      throw new Error('Failed to upload video to storage');
    }
    // Get public URL for video
    const { data: videoUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(videoFilename);
    const videoUrl = videoUrlData.publicUrl;
    // Handle thumbnail
    let thumbnailUrl = null;
    if (thumbnailFile) {
      // User provided thumbnail
      const thumbBuffer = fs.readFileSync(thumbnailFile.path);
      const thumbFilename = `thumb-${Date.now()}${path.extname(thumbnailFile.originalname)}`;
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from('thumbnails')
        .upload(thumbFilename, thumbBuffer, {
          contentType: thumbnailFile.mimetype,
          upsert: false
        });
      if (!thumbError) {
        const { data: thumbUrlData } = supabase.storage
          .from('thumbnails')
          .getPublicUrl(thumbFilename);
        thumbnailUrl = thumbUrlData.publicUrl;
      }
      // Clean up temp file
      fs.unlinkSync(thumbnailFile.path);
    } else {
      // Generate thumbnail from video
      try {
        const tempThumbPath = path.join(__dirname, '../uploads/temp', thumbnailFilename);
        // Ensure temp directory exists
        const tempDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        console.log('Generating thumbnail from video...');
        await generateThumbnail(videoFile.path, tempThumbPath);
        console.log('Thumbnail generated successfully');
        const thumbBuffer = fs.readFileSync(tempThumbPath);
        const { data: thumbData, error: thumbError } = await supabase.storage
          .from('thumbnails')
          .upload(thumbnailFilename, thumbBuffer, {
            contentType: 'image/png',
            upsert: false
          });
        if (!thumbError) {
          const { data: thumbUrlData } = supabase.storage
            .from('thumbnails')
            .getPublicUrl(thumbnailFilename);
          thumbnailUrl = thumbUrlData.publicUrl;
          console.log('Thumbnail uploaded to Supabase:', thumbnailUrl);
        }
        // Clean up temp thumbnail
        fs.unlinkSync(tempThumbPath);
      } catch (err) {
        console.error('Thumbnail generation error:', err);
        thumbnailUrl = 'https://via.placeholder.com/640x360?text=No+Thumbnail';
      }
    }
    // Clean up temp video file
    fs.unlinkSync(videoFile.path);
    // Insert video record into database
    const { data: video, error } = await supabase
      .from('videos')
      .insert([{
        user_id: req.user.id,
        title,
        description: description || '',
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration: duration,
        category: category || 'General',
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
      }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({
      message: 'Video uploaded successfully',
      video
    });
  } catch (error) {
    console.error('Upload video error:', error);
    res.status(500).json({
      error: 'Server error during video upload',
      details: error.message
    });
  }
};
// ... (rest of the functions remain the same)
export const getAllVideos = async (req, res) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query;
    let query = supabase
      .from('videos')
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (category && category !== 'All') {
      query = query.eq('category', category);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }
    const { data: videos, error } = await query;
    if (error) throw error;
    res.json({ videos });
  } catch (error) {
    console.error('Get all videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
export const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: video, error } = await supabase
      .from('videos')
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    const { data: likes } = await supabase
      .from('likes')
      .select('type')
      .eq('video_id', id);
    const likeCount = likes?.filter(l => l.type === 'like').length || 0;
    const dislikeCount = likes?.filter(l => l.type === 'dislike').length || 0;
    res.json({
      video: {
        ...video,
        likeCount,
        dislikeCount
      }
    });
  } catch (error) {
    console.error('Get video by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
export const incrementViews = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: video, error } = await supabase
      .from('videos')
      .select('views')
      .eq('id', id)
      .single();
    if (error) throw error;
    const { error: updateError } = await supabase
      .from('videos')
      .update({ views: (video.views || 0) + 1 })
      .eq('id', id);
    if (updateError) throw updateError;
    res.json({ message: 'View count incremented' });
  } catch (error) {
    console.error('Increment views error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
export const likeVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    if (!['like', 'dislike'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const { data: existingLike } = await supabase
      .from('likes')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('video_id', id)
      .single();
    if (existingLike) {
      if (existingLike.type === type) {
        await supabase
          .from('likes')
          .delete()
          .eq('id', existingLike.id);
        return res.json({ message: 'Like removed' });
      } else {
        await supabase
          .from('likes')
          .update({ type })
          .eq('id', existingLike.id);
        return res.json({ message: 'Like updated' });
      }
    } else {
      await supabase
        .from('likes')
        .insert([{ user_id: req.user.id, video_id: id, type }]);
      res.json({ message: 'Like added' });
    }
  } catch (error) {
    console.error('Like video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: video } = await supabase
      .from('videos')
      .select('user_id, video_url, thumbnail_url')
      .eq('id', id)
      .single();
    if (!video || video.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    // Delete video from Supabase Storage if it's a Supabase URL
    if (video.video_url?.includes('supabase')) {
      const videoFilename = video.video_url.split('/').pop();
      await supabase.storage.from('videos').remove([videoFilename]);
    }
    // Delete thumbnail from Supabase Storage if it's a Supabase URL
    if (video.thumbnail_url?.includes('supabase')) {
      const thumbFilename = video.thumbnail_url.split('/').pop();
      await supabase.storage.from('thumbnails').remove([thumbFilename]);
    }
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
export const getTrendingVideos = async (req, res) => {
  try {
    const { data: videos, error } = await supabase
      .from('videos')
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .order('views', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ videos });
  } catch (error) {
    console.error('Get trending videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};