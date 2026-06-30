import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import {
  getVenueById,
  listVenues,
  createVenue,
  updateVenue,
  claimVenue,
  submitEditSuggestion,
} from './venue.service.js';

export const venueRouter = new Hono<{ Variables: { userId: string } }>();

venueRouter.get('/', async (c) => {
  const { city, type, drop_in } = c.req.query();
  const venues = await listVenues({
    city: city || undefined,
    type: type as any || undefined,
    dropInAvailable: drop_in !== undefined ? drop_in === 'true' : undefined,
  });
  return c.json({ venues });
});

venueRouter.get('/:id', async (c) => {
  const venue = await getVenueById(c.req.param('id'));
  if (!venue) return c.json({ error: 'Not found' }, 404);
  return c.json(venue);
});

venueRouter.post('/', auth, async (c) => {
  const body = await c.req.json();
  const venue = await createVenue(c.get('userId'), body);
  if (!venue) return c.json({ error: 'Forbidden' }, 403);
  return c.json(venue, 201);
});

venueRouter.patch('/:id', auth, async (c) => {
  const body = await c.req.json();
  const venue = await updateVenue(c.req.param('id'), c.get('userId'), body);
  if (!venue) return c.json({ error: 'Not found or forbidden' }, 404);
  return c.json(venue);
});

venueRouter.post('/:id/claim', auth, async (c) => {
  const venue = await claimVenue(c.req.param('id'), c.get('userId'));
  if (!venue) return c.json({ error: 'Not found or already claimed' }, 409);
  return c.json(venue);
});

venueRouter.post('/:id/suggest-edit', auth, async (c) => {
  const body = await c.req.json();
  const { fieldName, suggestedValue } = body;
  if (!fieldName || suggestedValue === undefined) {
    return c.json({ error: 'fieldName and suggestedValue are required' }, 400);
  }
  const ok = await submitEditSuggestion(c.req.param('id'), c.get('userId'), fieldName, suggestedValue);
  if (!ok) return c.json({ error: 'Failed to submit suggestion' }, 500);
  return c.json({ success: true });
});