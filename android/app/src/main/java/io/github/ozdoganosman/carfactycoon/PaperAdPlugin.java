package io.github.ozdoganosman.carfactycoon;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.gms.ads.nativead.NativeAdView;

/**
 * The newspaper's advertisement: an AdMob native ad set like a period classified ad (paper colour,
 * serif type, an "REKLAM" label) and laid over the slot the page keeps for it at the foot of the
 * newspaper reader. The page says where the slot is (CSS pixels) and hides it when the paper closes.
 */
@CapacitorPlugin(name = "PaperAd")
public class PaperAdPlugin extends Plugin {

    private static final int PAPER = Color.rgb(0xf3, 0xea, 0xd6);
    private static final int INK = Color.rgb(0x2a, 0x26, 0x20);
    private static final int FADED = Color.rgb(0x6b, 0x62, 0x55);

    private NativeAd ad;
    private NativeAdView view;

    @PluginMethod
    public void load(PluginCall call) {
        String unit = call.getString("adUnitId");
        if (unit == null) {
            call.reject("adUnitId missing");
            return;
        }
        getActivity().runOnUiThread(() -> {
            AdLoader loader = new AdLoader.Builder(getContext(), unit)
                .forNativeAd(nativeAd -> {
                    if (ad != null) ad.destroy();
                    ad = nativeAd;
                    call.resolve();
                })
                .withAdListener(
                    new AdListener() {
                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError error) {
                            call.reject(error.getMessage());
                        }
                    }
                )
                .withNativeAdOptions(new NativeAdOptions.Builder().setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT).build())
                .build();
            loader.loadAd(new AdRequest.Builder().build());
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (ad == null) {
            call.reject("no ad loaded");
            return;
        }
        double left = call.getDouble("left", 0.0);
        double top = call.getDouble("top", 0.0);
        double width = call.getDouble("width", 0.0);
        double height = call.getDouble("height", 0.0);
        double viewportWidth = call.getDouble("viewportWidth", 0.0);
        getActivity().runOnUiThread(() -> {
            WebView web = getBridge().getWebView();
            ViewGroup parent = (ViewGroup) web.getParent();
            // CSS pixels to screen pixels, measured from the page itself.
            float scale = viewportWidth > 0 ? (float) (web.getWidth() / viewportWidth) : getContext().getResources().getDisplayMetrics().density;
            removeView();
            view = build(getContext(), ad);
            parent.addView(view, new ViewGroup.LayoutParams(Math.round((float) width * scale), Math.round((float) height * scale)));
            view.setX(web.getX() + (float) left * scale);
            view.setY(web.getY() + (float) top * scale);
            view.setElevation(web.getElevation() + 1);
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            removeView();
            if (ad != null) {
                ad.destroy();
                ad = null;
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        removeView();
        if (ad != null) ad.destroy();
        ad = null;
    }

    private void removeView() {
        if (view == null) return;
        ViewGroup p = (ViewGroup) view.getParent();
        if (p != null) p.removeView(view);
        view.destroy();
        view = null;
    }

    private static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    private static TextView text(Context c, float sp, int color, int style) {
        TextView t = new TextView(c);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create(Typeface.SERIF, style));
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    /** icon | headline, body, advertiser | call to action; under a thin "REKLAM" rule. */
    private static NativeAdView build(Context c, NativeAd ad) {
        NativeAdView root = new NativeAdView(c);
        GradientDrawable paper = new GradientDrawable();
        paper.setColor(PAPER);
        paper.setStroke(dp(c, 1.5f), INK);
        root.setBackground(paper);

        LinearLayout column = new LinearLayout(c);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(dp(c, 10), dp(c, 4), dp(c, 10), dp(c, 8));

        TextView label = text(c, 10, FADED, Typeface.BOLD);
        label.setText("REKLAM");
        label.setLetterSpacing(0.25f);
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        column.addView(label, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        View rule = new View(c);
        rule.setBackgroundColor(INK);
        LinearLayout.LayoutParams ruleLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 1));
        ruleLp.setMargins(0, dp(c, 2), 0, dp(c, 6));
        column.addView(rule, ruleLp);

        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        if (ad.getIcon() != null) {
            ImageView icon = new ImageView(c);
            icon.setImageDrawable(ad.getIcon().getDrawable());
            icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(c, 44), dp(c, 44));
            iconLp.setMarginEnd(dp(c, 10));
            row.addView(icon, iconLp);
            root.setIconView(icon);
        }

        LinearLayout words = new LinearLayout(c);
        words.setOrientation(LinearLayout.VERTICAL);
        TextView headline = text(c, 16, INK, Typeface.BOLD);
        headline.setText(ad.getHeadline());
        headline.setMaxLines(1);
        words.addView(headline);
        root.setHeadlineView(headline);
        if (ad.getBody() != null) {
            TextView body = text(c, 12, INK, Typeface.NORMAL);
            body.setText(ad.getBody());
            body.setMaxLines(2);
            words.addView(body);
            root.setBodyView(body);
        }
        if (ad.getAdvertiser() != null) {
            TextView who = text(c, 11, FADED, Typeface.ITALIC);
            who.setText(ad.getAdvertiser());
            who.setMaxLines(1);
            words.addView(who);
            root.setAdvertiserView(who);
        }
        row.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        if (ad.getCallToAction() != null) {
            Button cta = new Button(c);
            cta.setText(ad.getCallToAction());
            cta.setAllCaps(false);
            cta.setTextColor(PAPER);
            cta.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
            cta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            cta.setMinHeight(0);
            cta.setMinimumHeight(0);
            cta.setPadding(dp(c, 12), dp(c, 6), dp(c, 12), dp(c, 6));
            GradientDrawable ink = new GradientDrawable();
            ink.setColor(INK);
            ink.setCornerRadius(dp(c, 3));
            cta.setBackground(ink);
            LinearLayout.LayoutParams ctaLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            ctaLp.setMarginStart(dp(c, 10));
            row.addView(cta, ctaLp);
            root.setCallToActionView(cta);
        }

        column.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(column, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setNativeAd(ad);
        return root;
    }
}
