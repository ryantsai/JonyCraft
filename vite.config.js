import { defineConfig } from 'vite';

function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') {
    return '/';
  }

  const trimmed = basePath.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig({
  base: normalizeBasePath(process.env.BASE_PATH),
});
