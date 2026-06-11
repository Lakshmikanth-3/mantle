import type { MIPDraft } from './drafter.js';
import { formatMIPAsMarkdown } from './drafter.js';

const MANTLE_FORUM_URL = process.env.MANTLE_FORUM_URL || 'https://forum.mantle.xyz';
const DISCOURSE_API_KEY = process.env.DISCOURSE_API_KEY!;
const DISCOURSE_USERNAME = process.env.DISCOURSE_USERNAME || 'sentinel-agent-021';
const DISCOURSE_CATEGORY_ID = parseInt(process.env.DISCOURSE_CATEGORY_ID || '9', 10);

export interface ForumPostResult {
  topicId: number;
  topicSlug: string;
  url: string;
  postId: number;
}

/**
 * Posts an auto-drafted MIP proposal to the Mantle Forum (Discourse).
 * Category: "Discussions and Soft Proposals" (category ID 9).
 * Title is prefixed with [SENTINEL AUTO-DRAFT] [DISCUSSION] per PRD §8.4.
 */
export async function postGovernanceDraft(draft: MIPDraft): Promise<ForumPostResult> {
  if (!DISCOURSE_API_KEY) {
    throw new Error('DISCOURSE_API_KEY not set — cannot post to Mantle Forum');
  }

  const title = `[SENTINEL AUTO-DRAFT] [DISCUSSION] ${draft.title}`;
  const body = formatMIPAsMarkdown(draft);

  const response = await fetch(`${MANTLE_FORUM_URL}/posts.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': DISCOURSE_API_KEY,
      'Api-Username': DISCOURSE_USERNAME,
    },
    body: JSON.stringify({
      title,
      raw: body,
      category: DISCOURSE_CATEGORY_ID,
      tags: ['sentinel', 'auto-draft', 'emergency-response'],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discourse API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    id: number;
    topic_id: number;
    topic_slug: string;
  };

  const url = `${MANTLE_FORUM_URL}/t/${data.topic_slug}/${data.topic_id}`;
  console.log(`[governance/forum] Posted MIP draft to: ${url}`);

  return {
    topicId: data.topic_id,
    topicSlug: data.topic_slug,
    url,
    postId: data.id,
  };
}
