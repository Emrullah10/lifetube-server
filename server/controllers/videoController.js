import { supabase } from '../config/supabase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== 'production') {
  ffmpeg.setFfmpegPath('C:\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe');
}

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

    const videoFilename = `video-${Date.now()}${path.extname(videoFile.originalname)}`;
    const videoDestPath = path.join(__dirname, '../uploads/videos', videoFilename);

    fs.copyFileSync(videoFile.path, videoDestPath);
    fs.unlinkSync(videoFile.path);

    const duration = await getVideoDuration(videoDestPath);

    let thumbnailUrl = null;

    if (thumbnailFile) {
      const thumbnailFilename = `thumb-${Date.now()}${path.extname(thumbnailFile.originalname)}`;
      const thumbDestPath = path.join(__dirname, '../uploads/thumbnails', thumbnailFilename);
      fs.copyFileSync(thumbnailFile.path, thumbDestPath);
      fs.unlinkSync(thumbnailFile.path);
      thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
    } else {
      try {
        const thumbnailFilename = `thumb-${Date.now()}.png`;
        const thumbDestPath = path.join(__dirname, '../uploads/thumbnails', thumbnailFilename);
        await generateThumbnail(videoDestPath, thumbDestPath);
        thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
      } catch (err) {
        thumbnailUrl = 'https://via.placeholder.com/640x360?text=No+Thumbnail';
      }
    }

    const videoUrl = `/uploads/videos/${videoFilename}`;

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
    res.status(500).json({ error: 'Server error during video upload' });
  }
};

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
      .select('user_id')
      .eq('id', id)
      .single();

    if (!video || video.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
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
