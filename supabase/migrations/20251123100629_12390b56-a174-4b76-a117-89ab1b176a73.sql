-- Create rooms table for sync music sessions
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id TEXT NOT NULL,
  track_url TEXT,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  playback_time NUMERIC NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create room_listeners table to track connected users
CREATE TABLE public.room_listeners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_listeners ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rooms - anyone can view, only host can update
CREATE POLICY "Anyone can view rooms"
ON public.rooms FOR SELECT
USING (true);

CREATE POLICY "Anyone can create rooms"
ON public.rooms FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only host can update room"
ON public.rooms FOR UPDATE
USING (host_id = auth.uid()::text);

-- RLS Policies for room_listeners
CREATE POLICY "Anyone can view room listeners"
ON public.room_listeners FOR SELECT
USING (true);

CREATE POLICY "Anyone can join as listener"
ON public.room_listeners FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can remove themselves"
ON public.room_listeners FOR DELETE
USING (user_id = auth.uid()::text);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_listeners;

-- Set replica identity for proper realtime updates
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_listeners REPLICA IDENTITY FULL;