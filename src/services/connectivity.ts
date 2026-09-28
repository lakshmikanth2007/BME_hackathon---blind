/** Minimal connectivity probe. Speaks the offline notice once when the network
 * drops. Avoids an extra native dependency by using a lightweight fetch. */
let online = true;

export async function checkOnline(): Promise<boolean> {
  try {
    const res = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
    });
    online = res.ok || res.status === 204;
  } catch {
    online = false;
  }
  return online;
}

export function isOnline(): boolean {
  return online;
}
