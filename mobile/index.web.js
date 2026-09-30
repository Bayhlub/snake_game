import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

// In the browser, Skia's drawing engine (public/canvaskit.wasm) must load before the app starts.
// Handy for quick checks with `npm run web`; the real targets are Android and iOS.
LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' }).then(async () => {
    const App = (await import('./App')).default;
    registerRootComponent(App);
});
