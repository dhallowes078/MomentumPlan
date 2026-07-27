package app.momentum.plan;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Android 15+ draws edge-to-edge. Shrink the WebView with system-bar margins so
 * all web content — including position:fixed bottom nav and sticky tabs — stays
 * clear of the status bar and gesture/navigation bar.
 */
public class MainActivity extends BridgeActivity {
  private static final int APP_BG = Color.parseColor("#e8efe9");
  private boolean listenerAttached = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().getDecorView().setBackgroundColor(APP_BG);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    scheduleSystemBarInsets();
  }

  @Override
  public void onResume() {
    super.onResume();
    scheduleSystemBarInsets();
  }

  private void scheduleSystemBarInsets() {
    getWindow().getDecorView().post(this::applySystemBarInsets);
  }

  private void applySystemBarInsets() {
    if (getBridge() == null || getBridge().getWebView() == null) {
      getWindow().getDecorView().postDelayed(this::applySystemBarInsets, 50);
      return;
    }

    final WebView webView = getBridge().getWebView();
    webView.setBackgroundColor(APP_BG);

    if (listenerAttached) {
      ViewCompat.requestApplyInsets(webView);
      return;
    }
    listenerAttached = true;

    ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
      Insets bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
      );

      ViewGroup.LayoutParams raw = v.getLayoutParams();
      if (raw instanceof ViewGroup.MarginLayoutParams) {
        ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) raw;
        if (
          lp.leftMargin != bars.left ||
          lp.topMargin != bars.top ||
          lp.rightMargin != bars.right ||
          lp.bottomMargin != bars.bottom
        ) {
          lp.setMargins(bars.left, bars.top, bars.right, bars.bottom);
          v.setLayoutParams(lp);
        }
      } else {
        // Fallback if layout params don’t support margins.
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      }

      // Native margins already clear system bars — zero CSS insets to avoid double offset.
      webView.post(() ->
        webView.evaluateJavascript(
          "document.documentElement.style.setProperty('--safe-top','0px');" +
          "document.documentElement.style.setProperty('--safe-bottom','0px');" +
          "document.documentElement.style.setProperty('--safe-left','0px');" +
          "document.documentElement.style.setProperty('--safe-right','0px');" +
          "document.documentElement.style.setProperty('--safe-area-inset-top','0px');" +
          "document.documentElement.style.setProperty('--safe-area-inset-bottom','0px');" +
          "document.documentElement.style.setProperty('--safe-area-inset-left','0px');" +
          "document.documentElement.style.setProperty('--safe-area-inset-right','0px');",
          null
        )
      );

      return WindowInsetsCompat.CONSUMED;
    });
    ViewCompat.requestApplyInsets(webView);
  }
}
