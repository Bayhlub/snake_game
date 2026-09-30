/**
 * Makes the game installable as a phone app: registers the offline service worker
 * and shows an "Install app" button when the browser offers one (Android / desktop Chrome).
 * iPhone users install with Share → Add to Home Screen instead.
 */
export function setUpInstallableApp(installButton) {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
    }

    let installPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        installPrompt = event;
        installButton.hidden = false;
    });

    installButton.addEventListener('click', async () => {
        installButton.hidden = true;
        await installPrompt?.prompt();
        installPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
        installButton.hidden = true;
    });
}
