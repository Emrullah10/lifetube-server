import { supabase } from '../config/supabase.js';

export const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, email, avatar_url, created_at')
      .eq('id', id)
      .single();

    if (userError) throw userError;

    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    if (videosError) throw videosError;

    const { data: subscribers, error: subsError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('channel_id', id);

    if (subsError) throw subsError;

    res.json({
      user: {
        ...user,
        subscriberCount: subscribers?.length || 0,
        videos: videos || []
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const subscribe = async (req, res) => {
  try {
    const { channelId } = req.body;

    if (!channelId) {
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    if (channelId === req.user.id) {
      return res.status(400).json({ error: 'Cannot subscribe to yourself' });
    }

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('subscriber_id', req.user.id)
      .eq('channel_id', channelId)
      .single();

    if (existing) {
      await supabase
        .from('subscriptions')
        .delete()
        .eq('id', existing.id);

      return res.json({ message: 'Unsubscribed successfully', subscribed: false });
    } else {
      await supabase
        .from('subscriptions')
        .insert([{
          subscriber_id: req.user.id,
          channel_id: channelId
        }]);

      res.json({ message: 'Subscribed successfully', subscribed: true });
    }
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getSubscriptions = async (req, res) => {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        users:channel_id (id, username, avatar_url)
      `)
      .eq('subscriber_id', req.user.id);

    if (error) throw error;

    res.json({ subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getSubscriptionFeed = async (req, res) => {
  try {
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('channel_id')
      .eq('subscriber_id', req.user.id);

    if (!subscriptions || subscriptions.length === 0) {
      return res.json({ videos: [] });
    }

    const channelIds = subscriptions.map(sub => sub.channel_id);

    const { data: videos, error } = await supabase
      .from('videos')
      .select(`
        *,
        users:user_id (id, username, avatar_url)
      `)
      .in('user_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    res.json({ videos });
  } catch (error) {
    console.error('Get subscription feed error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const checkSubscription = async (req, res) => {
  try {
    const { channelId } = req.params;

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('subscriber_id', req.user.id)
      .eq('channel_id', channelId)
      .single();

    res.json({ subscribed: !!subscription });
  } catch (error) {
    res.json({ subscribed: false });
  }
};
