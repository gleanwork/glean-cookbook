import type { Server } from 'node:http';

export function listenLocal(
  server: Server,
  name: string,
  onReady?: () => void,
): void {
  const port = process.env.PORT ? Number(process.env.PORT) : 0;
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local server port.');
    }
    console.log(`${name} running at http://localhost:${address.port}`);
    onReady?.();
  });
}
