// Platform adapter registry. Every key maps to a PlatformAdapter instance.
import { BloggerAdapter } from './blogger/adapter.js';
import { LinkedInAdapter } from './linkedin/adapter.js';
import { DevtoAdapter } from './devto/adapter.js';
import { HashnodeAdapter } from './hashnode/adapter.js';
import { XAdapter } from './x/adapter.js';

export const adapters = {
  blogger: new BloggerAdapter(),
  linkedin: new LinkedInAdapter(),
  devto: new DevtoAdapter(),
  hashnode: new HashnodeAdapter(),
  x: new XAdapter(),
};

export const adapterKeys = Object.keys(adapters);

export function getAdapter(key) {
  return adapters[key] || null;
}

// A platform capability is "supported" only if the platform is enabled in the
// DB catalog AND the capability flag is set. Everything else is unsupported.
export function platformSupports(db, platform, capability) {
  // capability: 'metrics' | 'comments' | 'publish' | 'media_upload' | 'scheduling'
  if (!platform || !platform.enabled) return false;
  const map = {
    publish: 'supports_publish',
    metrics: 'supports_metrics',
    comments: 'supports_comments',
    media_upload: 'supports_media_upload',
    scheduling: 'supports_scheduling',
  };
  return Boolean(platform[map[capability]]);
}