package app.momentum.plan;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Keep WebView content clear of Android status + navigation bars.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
