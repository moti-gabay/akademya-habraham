# Fake playback clip

A 60-second synthetic HLS clip (colour test pattern, silent audio) that the fake media
provider plays for every video, through `/api/dev/media/play/<videoId>/...`. It lives
here and not under `public/` on purpose: nothing in this folder is served without a
valid playback token, and the route that reads it is switched off on Vercel.

Generated once with ffmpeg 4.4 (not rebuilt in CI):

```bash
ffmpeg -y -f lavfi -i "testsrc2=size=320x180:rate=15" -f lavfi -i "anullsrc=r=22050:cl=mono" \
  -t 60 -c:v libx264 -preset veryslow -crf 32 -g 90 -keyint_min 90 -sc_threshold 0 -pix_fmt yuv420p \
  -c:a aac -b:a 16k -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_filename "dev-assets/clip/seg-%02d.mpegts" dev-assets/clip/playlist.m3u8
```

Ten 6-second segments (`.mpegts`, so nothing mistakes them for TypeScript), about 670 KB in all.
