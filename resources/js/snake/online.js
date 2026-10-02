import { createRemoteWorld } from './net.js';

/** Long enough for a sleeping free server (e.g. Render) to wake up. */
const CONNECT_TIMEOUT_MS = 60000;

/**
 * Join the online game at `url` as `name`. The callbacks report how it goes:
 * onJoined(world) once the server has given us a snake, onState(world, events) after every move,
 * onFailed(reason) if we can't join ('offline' or 'full'), onClosed() if the connection drops later.
 * Returns { send(message), leave() }.
 */
export function connectOnline(url, name, { onJoined, onState, onFailed, onClosed }) {
    const world = createRemoteWorld();
    let socket;
    let joined = false;
    let finished = false;

    const fail = (reason) => {
        if (!finished) {
            finished = true;
            onFailed(reason);
        }
        socket?.close();
    };

    try {
        socket = new WebSocket(url);
    } catch {
        queueMicrotask(() => fail('offline'));
        return { send() {}, leave() {} };
    }

    const timeout = setTimeout(() => !joined && fail('offline'), CONNECT_TIMEOUT_MS);

    socket.onopen = () => socket.send(JSON.stringify({ type: 'join', name }));
    socket.onerror = () => !joined && fail('offline');
    socket.onclose = () => {
        clearTimeout(timeout);
        if (!joined) {
            fail('offline');
        } else if (!finished) {
            finished = true;
            onClosed();
        }
    };
    socket.onmessage = (message) => {
        let data;
        try {
            data = JSON.parse(message.data);
        } catch {
            return;
        }
        if (data.type === 'full') {
            fail('full');
        } else if (data.type === 'welcome') {
            world.meId = data.id;
        } else if (data.type === 'state') {
            world.update(data.state);
            const events = data.events.map(world.unpackEvent);
            if (!joined && world.me()) {
                joined = true;
                clearTimeout(timeout);
                onJoined(world);
            }
            if (joined) {
                onState(world, events);
            }
        }
    };

    return {
        send(payload) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(payload));
            }
        },
        leave() {
            finished = true;
            clearTimeout(timeout);
            socket.close();
        },
    };
}
