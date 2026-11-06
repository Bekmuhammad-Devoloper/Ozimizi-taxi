package uz.moviytaxi.driver;

import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The order card drawn over other apps (needs "Display over other apps").
 * Built in code: it lives in the background service, with no activity around.
 */
final class OrderOverlay {
    interface Actions {
        void accept();

        void decline();
    }

    private static final int BLUE = 0xFF3B9BFF;
    private static final int INK = 0xFF0A0A0A;

    private final Context ctx;
    private final WindowManager wm;
    private final Handler main = new Handler(Looper.getMainLooper());
    private View root;
    private Runnable tick;
    private LinearLayout buttons;
    private TextView note;

    OrderOverlay(Context ctx) {
        this.ctx = ctx;
        this.wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
    }

    static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    boolean isShown() {
        return root != null;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(ctx);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView button(String s, int bg, int fg, View.OnClickListener click) {
        TextView b = text(s, 16, fg, true);
        b.setGravity(Gravity.CENTER);
        b.setBackground(rounded(bg, 14));
        b.setPadding(dp(8), dp(14), dp(8), dp(14));
        b.setOnClickListener(click);
        return b;
    }

    /** Returns false when it could not be drawn (the caller falls back to the notification). */
    boolean show(String title, String from, String to, String meta, int seconds, Actions actions) {
        hide();
        if (wm == null || !allowed(ctx)) return false;

        LinearLayout card = new LinearLayout(ctx);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(rounded(INK, 20));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));

        LinearLayout head = new LinearLayout(ctx);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView titleView = text(title, 16, 0xFFFFFFFF, true);
        head.addView(titleView, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        final TextView timer = text(String.valueOf(seconds), 20, INK, true);
        timer.setGravity(Gravity.CENTER);
        timer.setBackground(rounded(BLUE, 22));
        head.addView(timer, new LinearLayout.LayoutParams(dp(44), dp(44)));
        card.addView(head);

        if (from != null && !from.isEmpty()) addLine(card, "🟦 " + from, 14, 0xFFFFFFFF, 8);
        if (to != null && !to.isEmpty()) addLine(card, "🏁 " + to, 14, 0xFFFFFFFF, 4);
        if (meta != null && !meta.isEmpty()) addLine(card, meta, 13, 0xFFBFDBFE, 6);

        note = text("", 13, 0xFFFCA5A5, false);
        note.setVisibility(View.GONE);
        card.addView(note);

        buttons = new LinearLayout(ctx);
        buttons.setPadding(0, dp(12), 0, 0);
        TextView decline = button("Rad etish", 0xFF2A2A2A, 0xFFFFFFFF, v -> actions.decline());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.rightMargin = dp(8);
        buttons.addView(decline, lp);
        TextView accept = button("Qabul qilish", BLUE, INK, v -> actions.accept());
        buttons.addView(accept, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.4f));
        card.addView(buttons);

        int type = Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP;
        p.x = 0;
        p.y = dp(36);
        p.horizontalMargin = 0.03f;

        try {
            wm.addView(card, p);
            root = card;
        } catch (Exception e) {
            root = null;
            return false;
        }

        final int[] left = {seconds};
        tick = new Runnable() {
            @Override
            public void run() {
                left[0]--;
                if (left[0] <= 0) return;
                timer.setText(String.valueOf(left[0]));
                main.postDelayed(this, 1000);
            }
        };
        main.postDelayed(tick, 1000);
        return true;
    }

    private void addLine(LinearLayout card, String s, int sp, int color, int topDp) {
        TextView t = text(s, sp, color, false);
        t.setMaxLines(2);
        t.setPadding(0, dp(topDp), 0, 0);
        card.addView(t);
    }

    /** Request in flight / failed: the buttons step aside for a short text. */
    void showNote(String s) {
        if (root == null || note == null) return;
        note.setText(s);
        note.setVisibility(View.VISIBLE);
        note.setPadding(0, dp(10), 0, 0);
        if (buttons != null) buttons.setVisibility(View.GONE);
    }

    void hide() {
        if (tick != null) main.removeCallbacks(tick);
        tick = null;
        if (root != null && wm != null) {
            try {
                wm.removeViewImmediate(root);
            } catch (Exception ignored) {
            }
        }
        root = null;
        buttons = null;
        note = null;
    }
}
