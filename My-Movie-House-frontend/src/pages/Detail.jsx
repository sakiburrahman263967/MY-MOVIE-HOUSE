import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, library } from '../api.js';
import VideoPlayer from '../components/VideoPlayer.jsx';
import MovieCard from '../components/MovieCard.jsx';

export default function Detail() {
  const { type, id } = useParams();
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showStreams, setShowStreams] = useState(false);
  const [saved, setSaved] = useState(() => library.has(id));
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [similarItems, setSimilarItems] = useState([]);
  const [selectedActor, setSelectedActor] = useState(null);
  const [actorCredits, setActorCredits] = useState(null);
  const [actorLoading, setActorLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getMeta(type, id)
      .then((data) => {
        if (active) {
          setMeta(data);
          if (data?.seasons?.length > 0) {
            const firstSeason = data.seasons.find((s) => s.seasonNumber > 0)?.seasonNumber || data.seasons[0].seasonNumber;
            setSelectedSeason(firstSeason);
          }
        }
      })
      .catch((reason) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, id]);

  useEffect(() => {
    if (!meta || (meta.type !== 'series' && type !== 'series') || !selectedSeason) return;
    let active = true;
    setEpisodesLoading(true);
    api.getSeasonEpisodes(id, selectedSeason)
      .then((data) => {
        if (active) {
          setEpisodes(data.episodes || []);
        }
      })
      .catch(() => {
        if (active) setEpisodes([]);
      })
      .finally(() => {
        if (active) setEpisodesLoading(false);
      });
    return () => { active = false; };
  }, [id, selectedSeason, meta, type]);

  useEffect(() => setSaved(library.has(id)), [id]);

  useEffect(() => {
    let active = true;
    api.getSimilar(type, id)
      .then((data) => {
        if (active) setSimilarItems(data?.results || []);
      })
      .catch(() => {
        if (active) setSimilarItems([]);
      });
    return () => { active = false; };
  }, [type, id]);

  const handleActorClick = async (actor) => {
    setSelectedActor(actor);
    setActorLoading(true);
    setActorCredits(null);
    try {
      const data = await api.getPersonCredits(actor.name);
      setActorCredits(data);
    } catch {
      setActorCredits({ person: { name: actor.name, photo: actor.photo }, cast: [] });
    } finally {
      setActorLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-32 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm font-semibold text-white/70">Loading movie details...</p>
      </div>
    );
  }

  if (error || !meta) {
    const fallbackTitle = id?.startsWith('cs:') ? id.split(':').pop() : (id || 'Video');
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="spatial-card rounded-3xl p-8 border border-rose-500/30 text-rose-300">
          <p className="text-base font-bold">{error || 'Details not found for this title.'}</p>
          <p className="mt-2 text-xs text-white/60">
            You can reload this page or directly start streaming sources.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="btn-spatial-blue rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30"
            >
              🔄 Try Again / Reload Page
            </button>
            <button
              onClick={() => setShowStreams(true)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-xs font-bold text-white transition shadow-lg shadow-emerald-600/30"
            >
              ▶ Play Stream Directly
            </button>
            <Link to="/" className="btn-glass rounded-xl px-4 py-2.5 text-xs font-semibold text-white/80">
              Back to Home
            </Link>
          </div>
        </div>
        {showStreams && (
          <VideoPlayer
            type={type}
            id={id}
            title={fallbackTitle}
            onClose={() => setShowStreams(false)}
          />
        )}
      </div>
    );
  }

  const title = meta.name || meta.title || 'Untitled';
  const toggleLibrary = () => {
    if (saved) library.remove(id);
    else library.add({ id, type, title, poster: meta.poster });
    setSaved(!saved);
  };

  return (
    <>
      {/* Backdrop Banner with Spatial Vignette */}
      <div className="relative -mt-6 -mx-4 sm:-mx-6 md:-mx-8 h-[40vh] min-h-[280px] overflow-hidden md:h-[48vh]">
        {meta.background && (
          <img src={meta.background} alt="" className="h-full w-full object-cover object-center" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e1322] via-[#0e1322]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0e1322]/90 via-transparent to-[#0e1322]/90" />
      </div>

      <main className="relative mx-auto -mt-28 max-w-7xl px-2 pb-14 md:-mt-36">
        <div className="flex flex-col gap-6 md:flex-row md:items-end">
          {/* Poster Card */}
          {meta.poster ? (
            <div className="w-40 shrink-0 rounded-2xl p-1 spatial-card border border-white/20 shadow-2xl md:w-60">
              <img
                src={meta.poster}
                alt={title}
                className="w-full rounded-xl object-cover shadow-lg"
              />
            </div>
          ) : (
            <div className="grid h-60 w-40 shrink-0 place-items-center rounded-2xl spatial-card text-center p-4 text-white/50 border border-white/10 md:w-60">
              {title}
            </div>
          )}

          {/* Details Glass Card */}
          <div className="spatial-card flex-1 rounded-3xl p-6 sm:p-8 border border-white/20 bg-[#121828]/85 backdrop-blur-2xl shadow-2xl">
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="rounded-full bg-blue-600/30 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-300 border border-blue-400/40">
                My-Movie-House
              </span>
              {(meta.releaseInfo || meta.year) && (
                <span className="chip rounded-full px-2.5 py-0.5 text-xs font-semibold text-white/80">
                  {meta.releaseInfo || meta.year}
                </span>
              )}
              {meta.imdbRating && (
                <span className="chip rounded-full px-2.5 py-0.5 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-400/30 flex items-center gap-1">
                  <span>★</span> {meta.imdbRating}
                </span>
              )}
              {meta.runtime && (
                <span className="chip rounded-full px-2.5 py-0.5 text-xs font-medium text-white/60">
                  {meta.runtime}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl drop-shadow-md">
              {title}
            </h1>

            {meta.genres?.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {meta.genres.map((genre) => (
                  <span key={genre} className="chip rounded-full px-2.5 py-0.5 text-xs text-white/80">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {meta.description && (
              <p className="mt-4 max-w-3xl text-xs sm:text-sm leading-relaxed text-slate-300">
                {meta.description}
              </p>
            )}

            {/* Horizontal Cast & Actors List ("pasha pash i tahkbe all actor and click korle odel all movie serise dekhave") */}
            {(() => {
              const seen = new Set();
              const actors = [];
              const addActor = (name, character, photo) => {
                if (!name || typeof name !== 'string') return;
                const clean = name.trim();
                if (!clean || seen.has(clean.toLowerCase())) return;
                seen.add(clean.toLowerCase());
                actors.push({ name: clean, character, photo });
              };
              if (Array.isArray(meta?.cast)) {
                for (const item of meta.cast) {
                  if (typeof item === 'string') addActor(item);
                  else if (item && typeof item === 'object') addActor(item.name || item.title, item.character || item.role, item.photo || item.avatar);
                }
              }
              if (Array.isArray(meta?.links)) {
                for (const link of meta.links) {
                  if (link?.name && (link.category?.toLowerCase() === 'cast' || link.category?.toLowerCase() === 'actors')) {
                    addActor(link.name);
                  }
                }
              }
              if (Array.isArray(meta?.credits)) {
                for (const c of meta.credits) {
                  if (typeof c === 'string') addActor(c);
                  else if (c?.name) addActor(c.name, c.character, c.photo);
                }
              }

              if (actors.length === 0) return null;

              return (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full bg-blue-500" />
                      <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide">
                        Starring & Cast
                      </h3>
                      <span className="text-[10px] text-white/40">
                        ({actors.length} actors · Click to view all movies & series)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                    {actors.map((actor) => (
                      <button
                        type="button"
                        key={actor.name}
                        onClick={() => handleActorClick(actor)}
                        title={`View all movies & TV series starring ${actor.name}`}
                        className="group flex items-center gap-2.5 rounded-xl bg-white/[0.04] hover:bg-blue-600/20 border border-white/10 hover:border-blue-400/50 px-3 py-2 transition-all duration-200 text-left"
                      >
                        {actor.photo ? (
                          <img
                            src={actor.photo}
                            alt={actor.name}
                            className="h-8 w-8 rounded-full object-cover border border-white/20 shrink-0"
                          />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-600/30 border border-blue-400/30 text-blue-300 font-bold text-xs shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
                            {actor.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 text-left">
                          <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors truncate">
                            {actor.name}
                          </p>
                          {actor.character && (
                            <p className="text-[10px] text-white/50 truncate">
                              {actor.character}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* TV Series Seasons & Episodes Section */}
            {(meta.type === 'series' || type === 'series' || (meta.seasons && meta.seasons.length > 0)) && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-1 rounded-full bg-emerald-500" />
                    <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide">
                      Seasons & Episodes
                    </h3>
                    {meta.totalEpisodes > 0 && (
                      <span className="text-[10px] text-white/50">
                        ({meta.totalEpisodes} episodes)
                      </span>
                    )}
                  </div>
                  {meta.seasons && meta.seasons.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-[280px] sm:max-w-md">
                      {meta.seasons.map((s) => (
                        <button
                          key={s.seasonNumber}
                          onClick={() => setSelectedSeason(s.seasonNumber)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap ${
                            selectedSeason === s.seasonNumber
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 border border-blue-400'
                              : 'bg-white/5 hover:bg-white/15 text-white/70 border border-white/10'
                          }`}
                        >
                          {s.name || `Season ${s.seasonNumber}`}
                          {s.episodeCount > 0 && (
                            <span className="ml-1 opacity-60 text-[10px]">({s.episodeCount})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {episodesLoading ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <p className="text-[11px] text-white/60">Loading episodes for Season {selectedSeason}...</p>
                  </div>
                ) : episodes.length === 0 ? (
                  <div className="rounded-xl bg-white/5 p-4 text-center border border-white/10 text-xs text-white/50">
                    No episode list available for Season {selectedSeason}. Click &quot;Stream Now&quot; below to search stream sources.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                    {episodes.map((ep) => (
                      <button
                        key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                        onClick={() => {
                          setActiveEpisode({
                            season: ep.seasonNumber || selectedSeason,
                            episode: ep.episodeNumber,
                            name: ep.name
                          });
                          setShowStreams(true);
                        }}
                        className="group flex items-start gap-2.5 rounded-xl bg-white/[0.04] hover:bg-blue-600/20 border border-white/10 hover:border-blue-400/50 p-2 text-left transition-all"
                      >
                        <div className="relative h-14 w-24 shrink-0 rounded-lg overflow-hidden bg-black/60 border border-white/10">
                          {ep.stillPath ? (
                            <img src={ep.stillPath} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-[10px] text-white/40 font-mono">
                              EP {ep.episodeNumber}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition grid place-items-center">
                            <span className="h-5 w-5 rounded-full bg-blue-600/90 text-white grid place-items-center text-[9px] shadow-sm ml-0.5">▶</span>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-blue-400 font-mono">
                              E{ep.episodeNumber}
                            </span>
                            <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors truncate">
                              {ep.name || `Episode ${ep.episodeNumber}`}
                            </p>
                          </div>
                          {ep.overview && (
                            <p className="text-[10px] text-white/50 line-clamp-2 mt-0.5 leading-snug">
                              {ep.overview}
                            </p>
                          )}
                          {ep.airDate && (
                            <p className="text-[9px] text-slate-400 mt-1">
                              {ep.airDate} {ep.runtime ? `• ${ep.runtime}` : ''}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  if ((meta.type === 'series' || type === 'series') && episodes.length > 0 && !activeEpisode) {
                    setActiveEpisode({
                      season: selectedSeason,
                      episode: episodes[0].episodeNumber,
                      name: episodes[0].name
                    });
                  }
                  setShowStreams(true);
                }}
                className="btn-spatial-blue flex items-center gap-2.5 rounded-xl px-7 py-3 text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/40"
              >
                <span>▶</span> Stream Now {activeEpisode ? `(S${activeEpisode.season}E${activeEpisode.episode})` : ''}
              </button>
              <button
                onClick={toggleLibrary}
                className="btn-glass flex items-center gap-2 rounded-xl px-5 py-3 text-xs sm:text-sm font-bold text-white/90"
              >
                {saved ? '✓ In Watchlist' : '+ Add to Watchlist'}
              </button>
            </div>

            <div className="mt-6 pt-3.5 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Curated by Sakibur Rahman</span>
              <span>My-Movie-House HD Player</span>
            </div>
          </div>
        </div>

        {/* ─── More Like This (Similar & Recommended Titles) ─── */}
        {similarItems.length > 0 && (
          <div className="mt-10 border-t border-white/10 pt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-4 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white">
                  More Like This
                </h2>
                <span className="text-xs text-white/40 hidden sm:inline">
                  (Recommended & Similar Titles)
                </span>
              </div>
              <span className="text-xs font-mono text-blue-400">
                {similarItems.length} Titles
              </span>
            </div>

            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scroll-smooth">
              {similarItems.map((item) => (
                <MovieCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ─── Direct In-Player Streaming & Resource Scanner ─── */}
      {showStreams && (
        <VideoPlayer
          type={type}
          id={activeEpisode ? `${id}:${activeEpisode.season}:${activeEpisode.episode}` : id}
          title={activeEpisode ? `${title} - S${activeEpisode.season}E${activeEpisode.episode}: ${activeEpisode.name}` : title}
          poster={meta?.poster}
          onClose={() => {
            setShowStreams(false);
            setActiveEpisode(null);
          }}
        />
      )}

      {/* ─── Actor Filmography & Works Modal ─── */}
      {selectedActor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedActor(null)}
        >
          <div
            className="spatial-card relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-[#0b101e] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Header / Actor Profile */}
            <div className="relative border-b border-white/10 p-5 bg-gradient-to-r from-blue-900/40 via-purple-900/20 to-transparent flex items-start gap-4">
              {actorCredits?.person?.photo || selectedActor.photo ? (
                <img
                  src={actorCredits?.person?.photo || selectedActor.photo}
                  alt={selectedActor.name}
                  className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover border-2 border-blue-400/50 shadow-xl shrink-0"
                />
              ) : (
                <div className="grid h-20 w-20 sm:h-24 sm:w-24 place-items-center rounded-2xl bg-blue-600/30 border border-blue-400/40 text-blue-300 font-black text-2xl shrink-0">
                  {selectedActor.name.charAt(0)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300 border border-blue-400/30">
                    {actorCredits?.person?.knownFor || 'Actor'}
                  </span>
                  {actorCredits?.person?.birthday && (
                    <span className="text-[11px] text-white/50">
                      Born: {actorCredits.person.birthday.slice(0, 4)}
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-2xl font-black text-white mt-1">
                  {actorCredits?.person?.name || selectedActor.name}
                </h2>
                {selectedActor.character && (
                  <p className="text-xs text-blue-300/80 mt-0.5">
                    Role: <span className="font-semibold text-white">{selectedActor.character}</span>
                  </p>
                )}
                {actorCredits?.person?.biography && (
                  <p className="text-[11px] sm:text-xs text-white/60 line-clamp-2 sm:line-clamp-3 mt-1.5 leading-relaxed">
                    {actorCredits.person.biography}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedActor(null)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Filmography Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6" onWheel={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-1 rounded-full bg-emerald-500" />
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    All Movies & TV Series
                  </h3>
                  <span className="text-xs text-white/40">
                    ({actorCredits?.cast?.length || 0} titles found)
                  </span>
                </div>
              </div>

              {actorLoading ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <p className="text-xs text-white/60">Fetching full filmography for {selectedActor.name}...</p>
                </div>
              ) : !actorCredits?.cast || actorCredits.cast.length === 0 ? (
                <div className="py-12 text-center text-xs text-white/50">
                  No additional titles found for this actor.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {actorCredits.cast.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedActor(null)}
                    >
                      <MovieCard item={item} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
