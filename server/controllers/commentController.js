import { supabase } from '../config/supabase.js';

// Add comment
export const addComment = async (req, res) => {
  try {
    const { videoId, text, parentId } = req.body;

    if (!videoId || !text) {
      return res.status(400).json({ error: 'Video ID and text are required' });
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert([
        {
          user_id: req.user.id,
          video_id: videoId,
          parent_id: parentId || null,
          text
        }
      ])
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Comment added successfully',
      comment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get comments for a video
export const getComments = async (req, res) => {
  try {
    const { videoId } = req.params;

    const { data: comments, error } = await supabase
      .from('comments')
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .eq('video_id', videoId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const { data: replies } = await supabase
          .from('comments')
          .select(`
            *,
            users:user_id (id, username, avatar_url)
          `)
          .eq('parent_id', comment.id)
          .order('created_at', { ascending: true });

        return {
          ...comment,
          replies: replies || []
        };
      })
    );

    res.json({ comments: commentsWithReplies });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete comment
export const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if comment belongs to user
    const { data: comment } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!comment || comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
