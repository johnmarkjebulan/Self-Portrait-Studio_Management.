import { useEffect, useMemo, useState } from "react";
import { postsApi } from "../../services/api";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function StaffPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [preview, setPreview] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    postsApi.getAll()
      .then((items) => { if (active) setPosts(Array.isArray(items) ? items : []); })
      .catch((err) => { if (active) setError(err?.message || "Could not load studio posts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!preview) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => { if (event.key === "Escape") setPreview(null); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [preview]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts
      .filter((post) => !q || [post.title, post.caption, post.author?.name].some((value) => String(value || "").toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort === "likes") return Number(b.like_count || 0) - Number(a.like_count || 0);
        const first = new Date(a.created_at || 0).getTime() || 0;
        const second = new Date(b.created_at || 0).getTime() || 0;
        return sort === "oldest" ? first - second : second - first;
      });
  }, [posts, search, sort]);

  const totalLikes = posts.reduce((total, post) => total + Number(post.like_count || 0), 0);

  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Studio Posts</h1>
          <p className="mt-1 text-sm text-gray-500">Browse published portraits, promos, and studio updates. Publishing is managed by Admin.</p>
        </div>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50">
          {loading ? "Loading..." : "Refresh posts"}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 card-shadow">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Published posts</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 tabular-nums">{posts.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 card-shadow">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Client likes</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 tabular-nums">{totalLikes}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Post search and sort">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Search published posts</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, caption, or author" className="w-full min-w-0 rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="likes">Most liked</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-gray-500">Showing {visible.length} of {posts.length} posts</p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error} <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="ml-2 font-semibold underline">Try again</button>
      </div>}
      {loading ? (
        <div role="status" className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-500">Loading studio posts...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {error ? "Unable to display posts at the moment." : posts.length ? "No posts match your search." : "No published studio posts yet."}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((post) => {
            const image = post.image_data || post.image_url;
            const name = post.title || "Pose and Pics";
            const likes = Number(post.like_count || 0);
            return (
              <article key={post.id} className="studio-card-motion min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white card-shadow">
                <button type="button" disabled={!image} onClick={() => setPreview({ src: image, title: name })}
                  aria-label={`Preview image for ${name}`} className="block w-full bg-gray-100 text-gray-500 disabled:cursor-default">
                  {image ? <img src={image} alt={name} loading="lazy" className="aspect-square w-full object-cover" />
                    : <span className="grid aspect-square w-full place-items-center text-sm">No image</span>}
                </button>
                <div className="space-y-2 p-4">
                  <h2 className="break-words font-semibold text-gray-900">{name}</h2>
                  {post.caption && <p className="line-clamp-3 whitespace-pre-line break-words text-sm text-gray-600">{post.caption}</p>}
                  <div className="flex flex-wrap justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <span>{formatDate(post.created_at)}</span>
                    <span>{likes.toLocaleString("en-PH")} client {likes === 1 ? "like" : "likes"}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {preview && (
        <div role="presentation" onClick={() => setPreview(null)} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={`Image preview: ${preview.title}`} onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[94vh] w-full max-w-6xl flex-col items-center">
            <button type="button" onClick={() => setPreview(null)} aria-label="Close preview"
              className="absolute right-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-xl font-semibold text-gray-900 shadow-lg">X</button>
            <img src={preview.src} alt={preview.title} className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain shadow-2xl" />
            <p className="mt-3 break-words text-center text-sm font-medium text-white">{preview.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
