# Video notes

Open a conversation. With `chat.video_notes` enabled, the microphone has a
camera-mode toggle; “Attach → Video note” also opens the recorder. Camera access
starts only after “Enable camera”. The default request prefers the front camera;
the switch selects a rear-facing camera before recording. Browsers choose the
actual available device, so a desktop with one camera can keep the same device.

Tap to start, tap stop to review. Alternatively hold the record button and release
to review; sliding upward locks capture until stop is tapped. Only the recording
button captures these gestures. Review permits playback, deletion, retaking or
sending. The camera/microphone stop on finish, cancellation, navigation, hiding
the document and unmount. Capture cannot continue invisibly in the background.
When browser capture is unsupported or permission is denied, upload MP4/MOV/WebM
instead. A queued note uses existing account-bound IndexedDB binary persistence,
server idempotency and upload cancellation/retry; local camera review is transient
until sending is confirmed. No claim of background browser upload is made.

Admins configure the server feature and 10–180 second limit (default 60).
Frontends hide creation when disabled; upload, send and forwarding recheck on the
server. Old messages remain readable. MP4 output and poster require authenticated
membership. A circular player's elapsed ring reflects actual playback, not a
fabricated viewing receipt. Regular chat delivery/read states retain their
existing semantics. No new public file URL, table or media service is introduced.

## Automated evidence

- `apps/api/tests/chat-video-notes.test.mjs`: real PostgreSQL, SQLite accounts,
  two API slots, ffmpeg-generated duration-less WebM; safe normalization/poster,
  group send/idempotency, membership, materials/search, reactions/reply/saved,
  forwarding, feature disable/read continuity, invalid/oversized/overlong input,
  deletion and targeted platform SSE.
- `apps/mobile/tests/chat-video-note.cjs`: actual Chromium MediaRecorder with
  Chromium's fake camera/microphone devices, front/rear constraints, click and
  hold-lock, 10 second automatic finish, permission/missing device failures,
  camera track cleanup, circular playback progress, 360/390/430px. Chromium and
  WebKit also cover real MP4 file import/playback and failed enqueue preserving
  the review. It does not certify physical iPhone/Android capture.
- `apps/mobile/tests/chat-video-outbox.cjs`: Chromium/WebKit real File + IndexedDB,
  offline/reload, failed upload/retry, correct video_note payload, cancellation
  before send and no late POST after cancellation; HTTP responses are fixtures.
- Existing full Chat API regression stays applicable to roles, receipts,
  attachments, personal privacy and blue/green database compatibility.

Browser fixtures run from local Vite on 4947. Their input `/tmp/egin-note-fixture.mp4`
can be generated inside the existing `egin-chat-test:local` image with ffmpeg:
`testsrc2=size=240x240:rate=12` + sine audio, two seconds, libx264/yuv420p + AAC.
Use the installed `mcr.microsoft.com/playwright:v1.63.0-noble` Docker image and
mount that fixture; no host installation or native build is needed.

## Physical-device checklist

Use staging, two disposable accounts and a private test group. Do not record
other people without permission. Complete on current iPhone Safari, Android
Chrome and desktop Chrome; record the OS/browser versions and any errors.

1. Open recorder: no permission dialog before tapping Enable camera. Grant both
   permissions; confirm front preview, portrait orientation and square crop.
2. Switch to rear camera before recording, record speech, stop and review with
   sound. Verify final unmirrored speech scene and expected crop/orientation.
3. Exercise tap record/stop and touch hold/release/slide-up lock. Scroll outside
   the record button; system back/swipe and keyboard must remain usable.
4. Record to the configured limit. Verify auto-stop, duration and stopped camera
   indicator. Cancel, retake, close modal, switch tab, lock phone and leave chat:
   the camera/microphone must stop rather than keep hidden capture alive.
5. Deny camera, deny microphone, and test another app holding the camera. The
   error must explain recovery and retain the ready-file upload option.
6. Send to the group; recipient plays with audible sound, pauses and repeats.
   Reload both devices: same message, poster, controls and real delivery/read
   state. Check quiet/vibrate audio policies through an explicit play gesture.
7. Disable connection before send; reload. Restore it and retry a failed upload.
   Verify one message only. Cancel an active upload: no later sent message.
8. React, reply, save, search video notes, open materials, forward to another
   conversation. Delete for all: original disappears and both media URLs become
   inaccessible; authorized forwarded copy remains usable.
9. Remove a member and attempt its saved media URL. Access must fail. Disable
   the feature as admin: new creation/forwarding fails, history continues to play.
10. Check 360–430px, screen rotation, all eight themes, reduce-motion enabled and
    a screen reader. No horizontal scrolling, clipped controls or automatic sound.
