import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, ShareNetwork, SkipBack, SkipForward, Waveform } from "@phosphor-icons/react";
import { formatDuration, getSharedPlaylist } from "../lib/supabase.js";

export function SharedPlaylistPage({ token }) {
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef(null);
  const current = playlist?.tracks?.[currentIndex] || null;

  useEffect(() => {
    getSharedPlaylist(token).then(setPlaylist).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current?.audio_url) return;
    audio.src = current.audio_url;
    if (playing) audio.play().catch(() => setPlaying(false));
  }, [current?.id]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !current?.audio_url) return;
    if (playing) audio.pause(); else audio.play();
    setPlaying(!playing);
  }

  function move(direction) {
    if (!playlist?.tracks?.length) return;
    setCurrentIndex((index) => (index + direction + playlist.tracks.length) % playlist.tracks.length);
  }

  if (loading) return <div className="route-state"><Waveform className="spin-pulse" weight="fill" /><p>Loading shared playlist…</p></div>;
  if (error || !playlist) return <div className="route-state"><h1>Playlist unavailable</h1><p>{error || "This link is private, expired, or incorrect."}</p><a href="/"><ArrowLeft /> Return to SoundSync</a></div>;

  return (
    <main className="shared-page">
      <header><a href="/" className="auth-brand"><span><Waveform weight="fill" /></span> SoundSync</a><button type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}><ShareNetwork /> Copy link</button></header>
      <section className="shared-hero">
        <img src={playlist.image} alt={`${playlist.title} cover`} />
        <div><span className="eyebrow">Shared playlist</span><h1>{playlist.title}</h1><p>{playlist.description || "A SoundSync playlist shared for listening."}</p><div className="shared-owner"><span>{playlist.owner?.display_name?.[0] || playlist.owner?.username?.[0] || "S"}</span><strong>{playlist.curator}</strong><small>{playlist.tracks.length} tracks · {playlist.likes_count || 0} likes</small></div><button className="shared-play" type="button" onClick={togglePlayback}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />} {playing ? "Pause" : "Play playlist"}</button></div>
      </section>
      <section className="shared-track-list">
        {playlist.tracks.map((track, index) => <button type="button" className={currentIndex === index ? "active" : ""} key={track.id} onClick={() => { setCurrentIndex(index); setPlaying(true); }}><span>{currentIndex === index && playing ? <Waveform weight="fill" /> : String(index + 1).padStart(2, "0")}</span><span><strong>{track.title}</strong><small>{track.artist}</small></span><small>{track.duration}</small></button>)}
      </section>
      {current && <footer className="shared-player"><div><strong>{current.title}</strong><small>{current.artist}</small></div><div className="shared-transport"><button onClick={() => move(-1)} aria-label="Previous"><SkipBack weight="fill" /></button><button onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button><button onClick={() => move(1)} aria-label="Next"><SkipForward weight="fill" /></button></div><div className="shared-time">{formatDuration(elapsed)} / {current.duration}</div></footer>}
      <audio ref={audioRef} onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => move(1)} />
    </main>
  );
}
