import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, CaretRight, ChatCircle, Check, Compass, DotsThree,
  Globe, Heart, House, LinkSimple, Lock, MagnifyingGlass, MusicNotes, Pause, PencilSimple,
  Play, Plus, Queue, Repeat, ShareNetwork, Shuffle, SignOut, SkipBack, SkipForward,
  SpeakerHigh, Trash, UploadSimple, User, Waveform, X,
} from "@phosphor-icons/react";
import { AuthScreen, PasswordRecoveryScreen } from "./components/AuthScreen.jsx";
import { SharedPlaylistPage } from "./components/SharedPlaylistPage.jsx";
import {
  addComment, addTrackToPlaylist, createPlaylist, deleteComment, deletePlaylist, deleteTrack,
  formatDuration, getMyProfile, getPlaylistDetails, getSession, listLikedPlaylists, listMyTracks,
  listPlaylists, onAuthChange, removeTrackFromPlaylist, reorderPlaylistTracks, signOut,
  togglePlaylistLike, updateMyProfile, updatePlaylist, uploadAudioFile, uploadAvatar,
  uploadPlaylistCover,
} from "./lib/supabase.js";

const artwork = {
  reggae: "/art/reggae-pulse.png", warm: "/art/warm-current.png", night: "/art/night-shift.png",
  slow: "/art/slow-motion.png", analog: "/art/analog-sun.png", gym: "/art/gym-time.png",
};
const fallbackTracks = [];

function IconButton({ label, className = "", children, onClick, active = false, disabled = false }) {
  return <button className={`icon-button ${className} ${active ? "is-active" : ""}`} type="button" aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Artwork({ src, alt, className = "" }) {
  return <img className={`artwork ${className}`} src={src || artwork.night} alt={alt} />;
}

function LoadingScreen({ label = "Loading SoundSync…" }) {
  return <div className="route-state"><Waveform className="spin-pulse" weight="fill" /><p>{label}</p></div>;
}

function Modal({ title, eyebrow, onClose, children, className = "" }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className={`upload-modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><IconButton label="Close" onClick={onClose}><X /></IconButton></div>{children}</section></div>;
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { resolve(Number.isFinite(audio.duration) ? audio.duration : null); URL.revokeObjectURL(objectUrl); };
    audio.onerror = () => { resolve(null); URL.revokeObjectURL(objectUrl); };
    audio.src = objectUrl;
  });
}

function Dashboard({ session }) {
  const [activeNav, setActiveNav] = useState("Discover");
  const [profile, setProfile] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [likedPlaylists, setLikedPlaylists] = useState([]);
  const [myTracks, setMyTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [tracks, setTracks] = useState(fallbackTracks);
  const [comments, setComments] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(.7);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const audioRef = useRef(null);

  const ownedPlaylists = useMemo(() => playlists.filter((item) => item.owner_id === session.user.id), [playlists, session.user.id]);
  const visiblePlaylists = useMemo(() => {
    let source = playlists;
    if (activeNav === "My music") source = ownedPlaylists;
    if (activeNav === "Liked") source = likedPlaylists;
    const normalized = query.trim().toLowerCase();
    return normalized ? source.filter((item) => `${item.title} ${item.curator}`.toLowerCase().includes(normalized)) : source;
  }, [activeNav, likedPlaylists, ownedPlaylists, playlists, query]);
  const isOwner = selectedPlaylist?.owner_id === session.user.id;

  function flash(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function refreshLibrary(preferredPlaylistId) {
    const [nextProfile, nextPlaylists, nextTracks, nextLiked] = await Promise.all([
      getMyProfile(), listPlaylists(), listMyTracks(), listLikedPlaylists(),
    ]);
    setProfile(nextProfile);
    setPlaylists(nextPlaylists);
    setMyTracks(nextTracks);
    setLikedPlaylists(nextLiked);
    setSelectedPlaylist((current) => nextPlaylists.find((item) => item.id === (preferredPlaylistId || current?.id)) || nextPlaylists[0] || null);
  }

  useEffect(() => {
    refreshLibrary().catch((cause) => flash(cause.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPlaylist?.id) { setTracks([]); setComments([]); return; }
    setDetailLoading(true);
    getPlaylistDetails(selectedPlaylist.id).then((details) => {
      setSelectedPlaylist((current) => current?.id === details.playlist.id ? { ...current, ...details.playlist } : current);
      setTracks(details.tracks);
      setComments(details.comments);
      setLiked(details.liked);
      if (!currentTrack && details.tracks[0]) setCurrentTrack(details.tracks[0]);
    }).catch((cause) => flash(cause.message)).finally(() => setDetailLoading(false));
  }, [selectedPlaylist?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.audio_url) return;
    audio.src = currentTrack.audio_url;
    setElapsed(0);
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack?.id]);

  function startTrack(track) {
    setCurrentTrack(track);
    setIsPlaying(true);
    window.setTimeout(() => audioRef.current?.play().catch(() => setIsPlaying(false)), 0);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.audio_url) { flash("Choose an uploaded track first."); return; }
    if (isPlaying) audio.pause(); else audio.play().catch((cause) => flash(cause.message));
  }

  function moveTrack(direction) {
    if (!tracks.length || !currentTrack) return;
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    startTrack(tracks[(index + direction + tracks.length) % tracks.length]);
  }

  async function handleCreatePlaylist(event) {
    event.preventDefault(); setBusy(true);
    try {
      const values = new FormData(event.currentTarget);
      const created = await createPlaylist({ title: String(values.get("title")), description: String(values.get("description")), visibility: String(values.get("visibility")) });
      const cover = values.get("cover");
      if (cover instanceof File && cover.size) await uploadPlaylistCover(created.id, cover);
      await refreshLibrary(created.id); setModal(null); flash("Playlist created");
    } catch (cause) { flash(cause.message); } finally { setBusy(false); }
  }

  async function handleEditPlaylist(event) {
    event.preventDefault(); if (!selectedPlaylist) return; setBusy(true);
    try {
      const values = new FormData(event.currentTarget);
      await updatePlaylist(selectedPlaylist.id, { title: String(values.get("title")), description: String(values.get("description")), visibility: String(values.get("visibility")) });
      const cover = values.get("cover");
      if (cover instanceof File && cover.size) await uploadPlaylistCover(selectedPlaylist.id, cover);
      await refreshLibrary(selectedPlaylist.id); setModal(null); flash("Playlist updated");
    } catch (cause) { flash(cause.message); } finally { setBusy(false); }
  }

  async function handleDeletePlaylist() {
    if (!selectedPlaylist || !window.confirm(`Delete “${selectedPlaylist.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try { await deletePlaylist(selectedPlaylist.id); await refreshLibrary(); setModal(null); flash("Playlist deleted"); }
    catch (cause) { flash(cause.message); } finally { setBusy(false); }
  }

  async function handleUpload(event) {
    event.preventDefault(); setBusy(true);
    try {
      const values = new FormData(event.currentTarget);
      const file = values.get("audio");
      if (!(file instanceof File) || !file.size) throw new Error("Choose an audio file.");
      const durationSeconds = await readAudioDuration(file);
      const track = await uploadAudioFile(file, {
        title: String(values.get("title")), artist: String(values.get("artist")), album: String(values.get("album")), genre: String(values.get("genre")), durationSeconds,
      });
      const playlistId = String(values.get("playlistId") || "");
      if (playlistId) await addTrackToPlaylist(playlistId, track.id);
      await refreshLibrary(playlistId || selectedPlaylist?.id); setCurrentTrack(track); setModal(null); flash("Track uploaded");
    } catch (cause) { flash(cause.message); } finally { setBusy(false); }
  }

  async function handleAddExisting(trackId) {
    if (!selectedPlaylist) return; setBusy(true);
    try { await addTrackToPlaylist(selectedPlaylist.id, trackId); const details = await getPlaylistDetails(selectedPlaylist.id); setTracks(details.tracks); setModal(null); flash("Track added"); }
    catch (cause) { flash(cause.message); } finally { setBusy(false); }
  }

  async function handleRemoveTrack(trackId) {
    if (!selectedPlaylist) return;
    try { await removeTrackFromPlaylist(selectedPlaylist.id, trackId); setTracks((items) => items.filter((track) => track.id !== trackId)); flash("Track removed"); }
    catch (cause) { flash(cause.message); }
  }

  async function handleReorder(trackId, direction) {
    if (!selectedPlaylist) return;
    const index = tracks.findIndex((track) => track.id === trackId);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setTracks(next);
    try { await reorderPlaylistTracks(selectedPlaylist.id, next.map((track) => track.id)); }
    catch (cause) { setTracks(tracks); flash(cause.message); }
  }

  async function handleLike() {
    if (!selectedPlaylist) return;
    try {
      const nextLiked = await togglePlaylistLike(selectedPlaylist.id); setLiked(nextLiked);
      setSelectedPlaylist((item) => ({ ...item, likesCount: Math.max(0, Number(item.likesCount || 0) + (nextLiked ? 1 : -1)) }));
      setLikedPlaylists(await listLikedPlaylists());
    } catch (cause) { flash(cause.message); }
  }

  async function handleComment(event) {
    event.preventDefault(); const body = commentDraft.trim(); if (!body || !selectedPlaylist) return;
    try { const comment = await addComment(selectedPlaylist.id, body); setComments((items) => [...items, comment]); setCommentDraft(""); }
    catch (cause) { flash(cause.message); }
  }

  async function handleDeleteComment(commentId) {
    try { await deleteComment(commentId); setComments((items) => items.filter((comment) => comment.id !== commentId)); }
    catch (cause) { flash(cause.message); }
  }

  async function handleShare() {
    if (!selectedPlaylist) return;
    if (selectedPlaylist.visibility === "private") { setModal("editPlaylist"); flash("Set the playlist to public or unlisted before sharing."); return; }
    const url = `${window.location.origin}/shared/${selectedPlaylist.share_token}`;
    try { await navigator.clipboard.writeText(url); flash("Share link copied"); }
    catch { window.prompt("Copy this share link", url); }
  }

  async function handleProfile(event) {
    event.preventDefault(); setBusy(true);
    try {
      const values = new FormData(event.currentTarget);
      let avatarPath = profile.avatar_path;
      const avatar = values.get("avatar");
      if (avatar instanceof File && avatar.size) avatarPath = await uploadAvatar(avatar);
      const next = await updateMyProfile({ username: String(values.get("username")), display_name: String(values.get("displayName")), bio: String(values.get("bio")), avatar_path: avatarPath });
      setProfile(next); setModal(null); flash("Profile updated");
    } catch (cause) { flash(cause.message); } finally { setBusy(false); }
  }

  const featured = playlists[0];
  const secondFeature = playlists[1];
  if (loading) return <LoadingScreen label="Loading your library…" />;

  return <div className="site-stage"><main className="app-shell">
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => setActiveNav("Discover")}><span className="brand-mark"><Waveform weight="fill" /></span><span>SoundSync</span></button>
      <nav className="primary-nav" aria-label="Primary navigation">{[["Home", House], ["Discover", Compass], ["My music", MusicNotes], ["Liked", Heart]].map(([label, Icon]) => <button key={label} className={activeNav === label ? "active" : ""} type="button" onClick={() => setActiveNav(label)}><Icon weight={activeNav === label ? "fill" : "regular"} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-section"><div className="sidebar-heading"><span>Your playlists</span><button type="button" aria-label="Create playlist" onClick={() => setModal("createPlaylist")}><Plus /></button></div><div className="mini-playlists">{ownedPlaylists.slice(0, 5).map((item) => <button key={item.id} type="button" onClick={() => setSelectedPlaylist(item)} className={selectedPlaylist?.id === item.id ? "selected" : ""}><Artwork src={item.image} alt="" /><span><strong>{item.title}</strong><small>{item.count} tracks</small></span></button>)}{!ownedPlaylists.length && <button type="button" className="empty-mini" onClick={() => setModal("createPlaylist")}><Plus /><span><strong>Create your first playlist</strong><small>Private by default</small></span></button>}</div></div>
      <button className="profile-chip" type="button" onClick={() => setModal("profile")}><span className="profile-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile?.display_name || profile?.username || "U").slice(0, 2).toUpperCase()}</span><span><strong>{profile?.display_name || profile?.username}</strong><small>View profile</small></span><CaretRight /></button>
    </aside>

    <section className="content-panel"><header className="topbar"><div><span className="eyebrow">{activeNav}</span><h1>{activeNav === "My music" ? "Your music, organized." : activeNav === "Liked" ? "Saved for another listen." : "Find your next sound."}</h1></div><div className="topbar-actions"><label className="search-box"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search playlists" aria-label="Search playlists" /><kbd>⌘ K</kbd></label><button className="upload-button" type="button" onClick={() => setModal("upload")}><UploadSimple weight="bold" /> Upload track</button></div></header>
      <div className="content-scroll">
        {activeNav === "Discover" && <section className="feature-grid" aria-label="Featured playlists">
          <button className="hero-card orange-card" type="button" onClick={() => featured && setSelectedPlaylist(featured)}><div className="hero-copy"><span className="eyebrow dark">Featured mix</span><h2>{featured?.title || "Your first great mix"}</h2><p>{featured?.description || "Upload music, build a playlist, and share it with your listeners."}</p><span className="text-link">Open the mix <ArrowRight /></span></div><Artwork src={featured?.image || artwork.warm} alt="Featured playlist artwork" className="hero-art" /></button>
          <button className="hero-card teal-card" type="button" onClick={() => secondFeature && setSelectedPlaylist(secondFeature)}><Artwork src={secondFeature?.image || artwork.reggae} alt="Playlist artwork" className="hero-art wide" /><div className="hero-copy compact"><span className="eyebrow dark">Editor’s cut</span><h2>{secondFeature?.title || "Make it yours"}</h2><span className="text-link">{secondFeature?.count || 0} tracks <CaretRight /></span></div></button>
        </section>}
        <section className="section-block"><div className="section-title-row"><div><span className="eyebrow">{activeNav === "My music" ? "Your library" : activeNav === "Liked" ? "Your likes" : "Community playlists"}</span><h2>{activeNav === "My music" ? "Created by you" : activeNav === "Liked" ? "Playlists you saved" : "Playlists for right now"}</h2></div><button type="button" onClick={() => setModal("createPlaylist")}><Plus /> New playlist</button></div>
          {!visiblePlaylists.length ? <div className="empty-state"><MusicNotes /><h3>No playlists here yet</h3><p>Create one or discover a public playlist to get started.</p><button type="button" onClick={() => setModal("createPlaylist")}><Plus /> Create playlist</button></div> : <div className="playlist-grid">{visiblePlaylists.map((item) => <article className={`playlist-card ${selectedPlaylist?.id === item.id ? "selected" : ""}`} key={item.id}><button type="button" className="cover-button" onClick={() => setSelectedPlaylist(item)}><Artwork src={item.image} alt={`${item.title} cover`} /><span className="card-play"><Play weight="fill" /></span></button><div className="card-meta"><button type="button" onClick={() => setSelectedPlaylist(item)}><strong>{item.title}</strong><span>{item.curator} · {item.count} tracks</span></button><IconButton label="More options" onClick={() => { setSelectedPlaylist(item); if (item.owner_id === session.user.id) setModal("editPlaylist"); }}><DotsThree weight="bold" /></IconButton></div></article>)}</div>}
        </section>
        <section className="section-block mix-section"><div className="section-title-row"><div><span className="eyebrow">Selected playlist</span><h2>{selectedPlaylist?.title || "Choose a playlist"}</h2></div>{isOwner && <button type="button" onClick={() => setModal("library")}><Plus /> Add from library</button>}</div>
          <div className="track-table" role="table">{detailLoading ? <div className="inline-loader">Loading tracks…</div> : tracks.length ? tracks.map((track, index) => <div className={`track-row ${currentTrack?.id === track.id ? "playing" : ""}`} role="row" key={track.id}><button className="track-main" type="button" onClick={() => startTrack(track)}><span className="track-index">{currentTrack?.id === track.id && isPlaying ? <Waveform weight="fill" /> : String(index + 1).padStart(2, "0")}</span><Artwork src={track.image} alt="" /><span className="track-name"><strong>{track.title}</strong><small>{track.artist}</small></span><span className="track-album">{track.album || track.genre || "SoundSync upload"}</span><span className="track-duration">{track.duration}</span></button>{isOwner && <div className="track-admin"><IconButton label="Move up" disabled={index === 0} onClick={() => handleReorder(track.id, -1)}><ArrowUp /></IconButton><IconButton label="Move down" disabled={index === tracks.length - 1} onClick={() => handleReorder(track.id, 1)}><ArrowDown /></IconButton><IconButton label="Remove" onClick={() => handleRemoveTrack(track.id)}><X /></IconButton></div>}</div>) : <div className="empty-state compact"><Queue /><h3>This playlist is empty</h3><p>{isOwner ? "Upload a track or add one from your library." : "The owner has not added tracks yet."}</p></div>}</div>
        </section>
      </div>
    </section>

    <aside className="detail-panel"><div className="detail-scroll">{selectedPlaylist ? <><div className="detail-head"><span className="eyebrow">{selectedPlaylist.visibility} playlist</span>{isOwner && <IconButton label="Edit playlist" onClick={() => setModal("editPlaylist")}><PencilSimple /></IconButton>}</div><Artwork src={selectedPlaylist.image} alt={`${selectedPlaylist.title} artwork`} className="detail-art" /><div className="detail-title"><h2>{selectedPlaylist.title}</h2><p>Curated by {selectedPlaylist.curator} · {tracks.length} tracks · {selectedPlaylist.likesCount || 0} likes</p></div><div className="playlist-actions"><IconButton label="Shuffle"><Shuffle /></IconButton><IconButton label={liked ? "Unlike" : "Like"} active={liked} onClick={handleLike}><Heart weight={liked ? "fill" : "regular"} /></IconButton><IconButton label="Share" onClick={handleShare}><ShareNetwork /></IconButton><button className="primary-play" type="button" onClick={togglePlayback}>{isPlaying ? <Pause weight="fill" /> : <Play weight="fill" />}</button></div>
      <div className="detail-tracks">{tracks.slice(0, 6).map((track, index) => <button type="button" key={track.id} onClick={() => startTrack(track)} className={currentTrack?.id === track.id ? "active" : ""}><span>{String(index + 1).padStart(2, "0")}</span><Artwork src={track.image} alt="" /><span><strong>{track.title}</strong><small>{track.artist}</small></span><small>{track.duration}</small></button>)}</div>
      <section className="comments-panel"><div className="comments-title"><span><ChatCircle /> Comments</span><small>{comments.length}</small></div>{comments.map((comment) => <div className="comment" key={comment.id}><span className="comment-avatar">{comment.authorName?.slice(0, 1) || "L"}</span><p><strong>{comment.authorName}</strong>{comment.body}</p>{(comment.author_id === session.user.id || isOwner) && <IconButton label="Delete comment" onClick={() => handleDeleteComment(comment.id)}><Trash /></IconButton>}</div>)}<form onSubmit={handleComment}><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a comment" /><button type="submit" disabled={!commentDraft.trim()}><ArrowRight weight="bold" /></button></form></section></> : <div className="empty-state"><MusicNotes /><h3>Select a playlist</h3><p>Details, tracks and comments will appear here.</p></div>}</div></aside>

    <footer className="player-bar"><div className="now-playing">{currentTrack ? <><Artwork src={currentTrack.image} alt="" /><span><strong>{currentTrack.title}</strong><small>{currentTrack.artist}</small></span><IconButton label="Current track"><MusicNotes /></IconButton></> : <><span className="player-placeholder"><MusicNotes /></span><span><strong>No track selected</strong><small>Choose an uploaded track</small></span></>}</div><div className="transport"><div className="transport-buttons"><IconButton label="Shuffle"><Shuffle /></IconButton><IconButton label="Previous" onClick={() => moveTrack(-1)}><SkipBack weight="fill" /></IconButton><button className="player-play" type="button" onClick={togglePlayback}>{isPlaying ? <Pause weight="fill" /> : <Play weight="fill" />}</button><IconButton label="Next" onClick={() => moveTrack(1)}><SkipForward weight="fill" /></IconButton><IconButton label="Repeat"><Repeat /></IconButton></div><div className="progress-row"><span>{formatDuration(elapsed)}</span><input type="range" min="0" max={duration || 0} value={Math.min(elapsed, duration || 0)} onChange={(event) => { const value = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = value; setElapsed(value); }} /><span>{formatDuration(duration)}</span></div></div><div className="volume"><Queue /><SpeakerHigh /><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></div></footer>
    <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)} onEnded={() => moveTrack(1)} />
  </main>

  {modal === "createPlaylist" && <Modal title="Create a playlist" eyebrow="Your library" onClose={() => setModal(null)}><form className="modal-form" onSubmit={handleCreatePlaylist}><label><span>Title</span><input name="title" required maxLength="120" placeholder="Late night selectors" /></label><label><span>Description</span><textarea name="description" maxLength="1000" placeholder="What does this playlist sound like?" /></label><label><span>Visibility</span><select name="visibility" defaultValue="private"><option value="private">Private</option><option value="unlisted">Unlisted link</option><option value="public">Public</option></select></label><label><span>Cover image</span><input name="cover" type="file" accept="image/*" /></label><button className="modal-submit" disabled={busy}>{busy ? "Creating…" : "Create playlist"}</button></form></Modal>}
  {modal === "editPlaylist" && selectedPlaylist && <Modal title="Edit playlist" eyebrow="Playlist settings" onClose={() => setModal(null)}><form className="modal-form" onSubmit={handleEditPlaylist}><label><span>Title</span><input name="title" required maxLength="120" defaultValue={selectedPlaylist.title} /></label><label><span>Description</span><textarea name="description" maxLength="1000" defaultValue={selectedPlaylist.description || ""} /></label><label><span>Visibility</span><select name="visibility" defaultValue={selectedPlaylist.visibility}><option value="private">Private</option><option value="unlisted">Unlisted link</option><option value="public">Public</option></select></label><label><span>Replace cover</span><input name="cover" type="file" accept="image/*" /></label><div className="modal-actions"><button className="danger-button" type="button" onClick={handleDeletePlaylist}><Trash /> Delete</button><button className="modal-submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div></form></Modal>}
  {modal === "upload" && <Modal title="Upload a track" eyebrow="Your library" onClose={() => setModal(null)}><form className="modal-form" onSubmit={handleUpload}><label className="drop-zone"><UploadSimple /><strong>Choose an audio file</strong><span>MP3, WAV, FLAC or M4A · up to 50 MB</span><input required type="file" name="audio" accept="audio/*" /></label><div className="auth-inline-fields"><label><span>Track title</span><input required name="title" maxLength="200" /></label><label><span>Artist</span><input name="artist" maxLength="200" /></label></div><div className="auth-inline-fields"><label><span>Album</span><input name="album" maxLength="200" /></label><label><span>Genre</span><input name="genre" maxLength="80" /></label></div><label><span>Add to playlist</span><select name="playlistId" defaultValue={isOwner ? selectedPlaylist?.id : ""}><option value="">Keep in music library</option>{ownedPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.title}</option>)}</select></label><button className="modal-submit" disabled={busy}>{busy ? "Uploading…" : "Upload track"}</button></form></Modal>}
  {modal === "library" && <Modal title="Add from your library" eyebrow={selectedPlaylist?.title} onClose={() => setModal(null)} className="library-modal"><div className="library-list">{myTracks.filter((track) => !tracks.some((item) => item.id === track.id)).map((track) => <div key={track.id}><Artwork src={track.image} alt="" /><span><strong>{track.title}</strong><small>{track.artist}</small></span><button type="button" onClick={() => handleAddExisting(track.id)}><Plus /> Add</button><IconButton label="Delete uploaded track" onClick={async () => { try { await deleteTrack(track); setMyTracks((items) => items.filter((item) => item.id !== track.id)); } catch (cause) { flash(cause.message); } }}><Trash /></IconButton></div>)}{!myTracks.length && <div className="empty-state"><UploadSimple /><h3>No uploads yet</h3><p>Upload a track first, then add it to any playlist.</p><button type="button" onClick={() => setModal("upload")}>Upload track</button></div>}</div></Modal>}
  {modal === "profile" && profile && <Modal title="Your profile" eyebrow={session.user.email} onClose={() => setModal(null)}><form className="modal-form" onSubmit={handleProfile}><div className="profile-edit-head"><span className="profile-avatar large">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || profile.username).slice(0, 2).toUpperCase()}</span><label><span>Profile photo</span><input name="avatar" type="file" accept="image/*" /></label></div><div className="auth-inline-fields"><label><span>Username</span><input name="username" required pattern="[A-Za-z0-9_]+" minLength="3" maxLength="30" defaultValue={profile.username} /></label><label><span>Display name</span><input name="displayName" maxLength="80" defaultValue={profile.display_name || ""} /></label></div><label><span>Bio</span><textarea name="bio" maxLength="300" defaultValue={profile.bio || ""} /></label><div className="modal-actions"><button className="danger-button" type="button" onClick={() => signOut()}><SignOut /> Sign out</button><button className="modal-submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div></form></Modal>}
  {toast && <div className="toast"><Check weight="bold" /> {toast}</div>}
  </div>;
}

export function App() {
  const sharedMatch = window.location.pathname.match(/^\/shared\/([^/]+)\/?$/);
  const [session, setSession] = useState(undefined);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  useEffect(() => {
    getSession().then(setSession).catch(() => setSession(null));
    return onAuthChange((nextSession, event) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
    });
  }, []);
  if (sharedMatch) return <SharedPlaylistPage token={decodeURIComponent(sharedMatch[1])} />;
  if (session === undefined) return <LoadingScreen />;
  if (recoveringPassword && session) return <PasswordRecoveryScreen onComplete={() => setRecoveringPassword(false)} />;
  if (!session) return <AuthScreen />;
  return <Dashboard session={session} />;
}
