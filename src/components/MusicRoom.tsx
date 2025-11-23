import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Music, Users, Play, Pause, Copy, Radio } from "lucide-react";

interface Room {
  id: string;
  host_id: string;
  track_url: string | null;
  is_playing: boolean;
  playback_time: number;
  last_updated_at: string;
}

export const MusicRoom = () => {
  const [userId, setUserId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");
  const [room, setRoom] = useState<Room | null>(null);
  const [listenerCount, setListenerCount] = useState<number>(0);
  const [trackUrl, setTrackUrl] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const lastSyncTime = useRef<number>(0);
  const isSyncing = useRef<boolean>(false);

  useEffect(() => {
    initUser();
    
    // Check for room ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setRoomCode(roomParam);
    }
  }, []);

  const initUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously();
      setUserId(data.user?.id || "");
    } else {
      setUserId(user.id);
    }
  };

  const createRoom = async () => {
    if (!userId) {
      toast({ title: "Authentication required", description: "Please wait...", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        host_id: userId,
        is_playing: false,
        playback_time: 0,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error creating room", description: error.message, variant: "destructive" });
      return;
    }

    setRoomId(data.id);
    setRoom(data);
    joinAsListener(data.id);
    setupRealtimeListeners(data.id);
    toast({ title: "Room created!", description: "Share the room ID to invite others" });
  };

  const joinRoom = async () => {
    if (!roomCode.trim()) {
      toast({ title: "Enter room code", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .select()
      .eq("id", roomCode)
      .maybeSingle();

    if (error || !data) {
      toast({ title: "Room not found", variant: "destructive" });
      return;
    }

    setRoomId(data.id);
    setRoom(data);
    joinAsListener(data.id);
    setupRealtimeListeners(data.id);
    toast({ title: "Joined room!", description: `Room ID: ${data.id.slice(0, 8)}` });
  };

  const joinAsListener = async (rId: string) => {
    await supabase.from("room_listeners").upsert({
      room_id: rId,
      user_id: userId,
      last_heartbeat: new Date().toISOString(),
    });
  };

  const setupRealtimeListeners = (rId: string) => {
    const roomChannel = supabase
      .channel(`room-${rId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${rId}`,
        },
        (payload) => {
          const newRoom = payload.new as Room;
          setRoom(newRoom);
          syncAudio(newRoom);
        }
      )
      .subscribe();

    const listenersChannel = supabase
      .channel(`listeners-${rId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_listeners",
          filter: `room_id=eq.${rId}`,
        },
        async () => {
          const { data } = await supabase
            .from("room_listeners")
            .select("*")
            .eq("room_id", rId);
          setListenerCount(data?.length || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(listenersChannel);
    };
  };

  const syncAudio = (roomData: Room) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Update track URL if changed
    if (roomData.track_url && audio.src !== roomData.track_url) {
      audio.src = roomData.track_url;
    }

    // Sync playback state
    const now = Date.now();
    const drift = Math.abs(audio.currentTime - Number(roomData.playback_time));

    isSyncing.current = true;
    
    if (roomData.is_playing && audio.paused) {
      audio.currentTime = Number(roomData.playback_time);
      audio.play().catch(console.error);
    } else if (!roomData.is_playing && !audio.paused) {
      audio.pause();
    } else if (drift > 0.3 && now - lastSyncTime.current > 1000) {
      audio.currentTime = Number(roomData.playback_time);
      lastSyncTime.current = now;
    }
    
    setTimeout(() => { isSyncing.current = false; }, 100);
  };

  const updateRoomState = async (updates: Partial<Room>) => {
    if (!roomId || room?.host_id !== userId) return;

    await supabase
      .from("rooms")
      .update({ ...updates, last_updated_at: new Date().toISOString() })
      .eq("id", roomId);
  };

  const handlePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    updateRoomState({ is_playing: true, playback_time: audio.currentTime });
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    updateRoomState({ is_playing: false, playback_time: audio.currentTime });
  };

  const handleSeek = () => {
    if (isSyncing.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    updateRoomState({ playback_time: audio.currentTime });
  };

  const setTrack = async () => {
    if (!trackUrl.trim()) return;
    await updateRoomState({ track_url: trackUrl, playback_time: 0, is_playing: false });
    toast({ title: "Track updated!" });
  };

  const copyRoomLink = () => {
    const fullUrl = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    toast({ title: "Room link copied!", description: "Share this link with others" });
  };

  const isHost = room?.host_id === userId;

  if (!roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 bg-card/60 backdrop-blur-xl border-border/50 shadow-glow">
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl gradient-primary">
                <Music className="w-8 h-8" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Sync Room
              </h1>
            </div>

            <div className="w-full space-y-6">
              <Button
                onClick={createRoom}
                className="w-full h-14 text-lg gradient-primary hover:opacity-90 transition-opacity shadow-glow"
              >
                <Radio className="w-5 h-5 mr-2" />
                Create Room
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or join existing</span>
                </div>
              </div>

              <div className="space-y-3">
                <Input
                  placeholder="Paste room ID or link"
                  value={roomCode}
                  onChange={(e) => {
                    // Extract room ID from URL if pasted
                    const value = e.target.value;
                    const urlMatch = value.match(/room=([a-f0-9-]+)/);
                    setRoomCode(urlMatch ? urlMatch[1] : value);
                  }}
                  className="h-12 bg-secondary/50 border-border/50"
                />
                <Button
                  onClick={joinRoom}
                  variant="secondary"
                  className="w-full h-12 text-base"
                >
                  Join Room
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8 bg-card/60 backdrop-blur-xl border-border/50 shadow-glow">
        <div className="space-y-8">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl gradient-primary">
                <Music className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Music Room</h2>
                <p className="text-xs text-muted-foreground font-mono">
                  {roomId}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50">
                <Users className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">{listenerCount}</span>
              </div>
              <Button
                onClick={copyRoomLink}
                variant="ghost"
                size="icon"
                className="hover:bg-secondary/50"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {isHost && (
            <div className="flex gap-2">
              <Input
                placeholder="Enter audio URL (MP3, WAV, etc.)"
                value={trackUrl}
                onChange={(e) => setTrackUrl(e.target.value)}
                className="bg-secondary/50 border-border/50"
              />
              <Button onClick={setTrack} className="gradient-accent">
                Set Track
              </Button>
            </div>
          )}

          <div className="space-y-4">
            <audio
              ref={audioRef}
              className="w-full"
              controls
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeek}
              controlsList={isHost ? "" : "nodownload noplaybackrate"}
            />

            {!isHost && (
              <p className="text-xs text-center text-muted-foreground">
                Host controls playback • You're synced automatically
              </p>
            )}

            {room?.track_url && (
              <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Now playing:</p>
                <p className="text-sm font-medium truncate">{room.track_url}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse-slow" />
            <span>Live sync active</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
