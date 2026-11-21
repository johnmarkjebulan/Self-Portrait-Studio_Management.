// WBS 3.4.1 - Published studio feed for Clients and public visitors.
// Independent from the Admin/Staff-only /api/posts authoring routes.
const router = require('express').Router();
const { Post, PostLike, User } = require('../models');
const { authenticate } = require('../middleware/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const author = [{ model: User, as: 'author', attributes: ['id', 'name', 'role'] }];

function safePost(row, likeCount, likedByMe) {
  const p = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: p.id,
    title: p.title || null,
    caption: p.caption || null,
    image_url: p.image_url || null,
    image_data: p.image_data || null,
    created_at: p.created_at,
    author: p.author ? { name: p.author.name, role: p.author.role } : null,
    like_count: Number(likeCount) || 0,
    liked_by_me: Boolean(likedByMe),
  };
}

async function listPublished(userId = null) {
  const posts = await Post.findAll({
    where: { is_published: true },
    include: author,
    order: [['created_at', 'DESC']],
    limit: 60,
  });
  return Promise.all(posts.map(async post => {
    const id = post.id;
    const [count, mine] = await Promise.all([
      PostLike.count({ where: { post_id: id } }),
      userId ? PostLike.findOne({ where: { post_id: id, client_id: userId } }) : Promise.resolve(null),
    ]);
    return safePost(post, count, Boolean(mine));
  }));
}

// Public landing page may show published posts without signing in.
// Register before the Client-only middleware.
router.get('/public', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=30');
    return res.json({ posts: await listPublished() });
  } catch (err) { return next(err); }
});

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ error: 'Client account required.' });
  }
  return next();
});

router.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    return res.json({ posts: await listPublished(req.user.id) });
  } catch (err) { return next(err); }
});

// Unique post_id/client_id database constraint protects against duplicate likes.
router.post('/:id/like', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
    const post = await Post.findOne({ where: { id: req.params.id, is_published: true } });
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const where = { post_id: post.id, client_id: req.user.id };
    const existing = await PostLike.findOne({ where });
    let liked;
    if (existing) {
      await existing.destroy();
      liked = false;
    } else {
      try {
        await PostLike.create(where);
      } catch (err) {
        if (err.name !== 'SequelizeUniqueConstraintError') throw err;
      }
      liked = true;
    }
    const likeCount = await PostLike.count({ where: { post_id: post.id } });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ liked, like_count: Number(likeCount) || 0 });
  } catch (err) { return next(err); }
});

module.exports = router;
