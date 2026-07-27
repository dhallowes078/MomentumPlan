package app.momentum.plan;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Marks the current widget task complete via the sync API, then refreshes the widget.
 */
final class MomentumWidgetCompleteWorker {
  private MomentumWidgetCompleteWorker() {}

  static void enqueue(Context context, String taskId) {
    final Context app = context.getApplicationContext();
    new Thread(() -> {
      SharedPreferences prefs = app.getSharedPreferences(MomentumWidgetProvider.PREFS, Context.MODE_PRIVATE);
      String token = prefs.getString("momentum_device_token", null);
      String apiBase = prefs.getString("momentum_sync_api_url", null);
      boolean ok = false;
      if (token != null && apiBase != null && !apiBase.isEmpty()) {
        ok = patchDone(apiBase, token, taskId);
      }
      if (ok) {
        bumpPayload(prefs, taskId);
      }
      new Handler(Looper.getMainLooper()).post(() -> MomentumWidgetProvider.refreshAll(app));
    }).start();
  }

  private static boolean patchDone(String apiBase, String token, String taskId) {
    HttpURLConnection conn = null;
    try {
      String base = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
      URL url = new URL(base + "/api/tasks/" + taskId);
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(12_000);
      conn.setReadTimeout(12_000);
      conn.setRequestMethod("PATCH");
      conn.setRequestProperty("Authorization", "Bearer " + token);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setDoOutput(true);
      byte[] body = "{\"status\":\"DONE\"}".getBytes(StandardCharsets.UTF_8);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int code = conn.getResponseCode();
      return code >= 200 && code < 300;
    } catch (Exception e) {
      return false;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static void bumpPayload(SharedPreferences prefs, String completedId) {
    try {
      String raw = prefs.getString(MomentumWidgetProvider.KEY_PAYLOAD, null);
      if (raw == null) return;
      JSONObject payload = new JSONObject(raw);
      JSONObject current = payload.optJSONObject("current");
      JSONObject next = payload.optJSONObject("next");
      if (current != null && completedId.equals(current.optString("id"))) {
        if (next != null) {
          payload.put("current", next);
          payload.remove("next");
        } else {
          current.put("completed", true);
          current.put("meta", "Completed");
          payload.put("current", current);
        }
      }
      prefs.edit().putString(MomentumWidgetProvider.KEY_PAYLOAD, payload.toString()).apply();
    } catch (Exception ignored) {
      // keep previous payload
    }
  }
}
