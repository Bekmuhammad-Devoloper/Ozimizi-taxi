package uz.moviytaxi.driver;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;

import java.util.ArrayDeque;
import java.util.List;

/**
 * Says navigation clips (res/raw/nav_*.mp3) one after another. Other apps' sound
 * is only turned down while it speaks. A new phrase replaces what is still waiting.
 */
final class VoicePlayer {
    private static final AudioAttributes ATTRS = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();

    private final Context ctx;
    private final AudioManager audio;
    private final ArrayDeque<String> queue = new ArrayDeque<>();
    private MediaPlayer player;
    private AudioFocusRequest focus;

    VoicePlayer(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.audio = (AudioManager) this.ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    void say(List<String> clips) {
        queue.clear();
        if (clips != null) queue.addAll(clips);
        if (player == null) next();
    }

    void stop() {
        queue.clear();
        release();
        giveFocusBack();
    }

    private void next() {
        release();
        String key = queue.poll();
        if (key == null) {
            giveFocusBack();
            return;
        }
        int id = ctx.getResources().getIdentifier("nav_" + key, "raw", ctx.getPackageName());
        if (id == 0) {
            next();
            return;
        }
        askFocus();
        try {
            MediaPlayer p = MediaPlayer.create(ctx, id, ATTRS, audio.generateAudioSessionId());
            if (p == null) {
                next();
                return;
            }
            player = p;
            p.setOnCompletionListener(m -> next());
            p.setOnErrorListener((m, what, extra) -> {
                next();
                return true;
            });
            p.start();
        } catch (Exception e) {
            next();
        }
    }

    private void release() {
        if (player == null) return;
        try {
            player.setOnCompletionListener(null);
            player.setOnErrorListener(null);
            player.release();
        } catch (Exception ignored) {
        }
        player = null;
    }

    private void askFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focus == null) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(ATTRS)
                    .setOnAudioFocusChangeListener(change -> { })
                    .build();
            }
            audio.requestAudioFocus(focus);
        } else {
            audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    private void giveFocusBack() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focus != null) audio.abandonAudioFocusRequest(focus);
        } else {
            audio.abandonAudioFocus(null);
        }
    }
}
