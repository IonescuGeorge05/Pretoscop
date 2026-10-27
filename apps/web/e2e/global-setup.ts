import { fixtureCli } from './fixture';

export default function globalSetup() {
  process.env.E2E_FIXTURE = JSON.stringify(fixtureCli('create'));
  return () => {
    fixtureCli('drop');
  };
}
