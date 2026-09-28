import { Config } from '@remotion/cli/config';

// YouTube Shorts: 1080 x 1920 H.264, high quality.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(17);
Config.setPixelFormat('yuv420p');
if (process.env.CHROME_PATH) Config.setBrowserExecutable(process.env.CHROME_PATH);
