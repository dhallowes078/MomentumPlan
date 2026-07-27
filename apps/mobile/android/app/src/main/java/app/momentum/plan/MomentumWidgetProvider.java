package app.momentum.plan;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

public class MomentumWidgetProvider extends AppWidgetProvider {
  public static final String PREFS = "CapacitorStorage";
  public static final String KEY_PAYLOAD = "momentum_widget";
  public static final String ACTION_COMPLETE = "app.momentum.plan.widget.COMPLETE";
  public static final String EXTRA_TASK_ID = "taskId";

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int id : appWidgetIds) {
      updateAppWidget(context, manager, id);
    }
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    super.onReceive(context, intent);
    if (ACTION_COMPLETE.equals(intent.getAction())) {
      String taskId = intent.getStringExtra(EXTRA_TASK_ID);
      if (taskId != null && !taskId.isEmpty()) {
        MomentumWidgetCompleteWorker.enqueue(context, taskId);
      }
    }
  }

  public static void refreshAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    int[] ids = manager.getAppWidgetIds(new ComponentName(context, MomentumWidgetProvider.class));
    if (ids == null || ids.length == 0) return;
    for (int id : ids) {
      updateAppWidget(context, manager, id);
    }
  }

  static void updateAppWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String raw = prefs.getString(KEY_PAYLOAD, null);

    String currentTitle = "No focus task";
    String currentMeta = "Open Momentum to sync your plan";
    String nextTitle = "—";
    String nextMeta = "";
    String currentId = null;
    boolean currentDone = false;

    if (raw != null && !raw.isEmpty()) {
      try {
        JSONObject payload = new JSONObject(raw);
        JSONObject current = payload.optJSONObject("current");
        JSONObject next = payload.optJSONObject("next");
        if (current != null) {
          currentId = current.optString("id", null);
          currentTitle = current.optString("title", currentTitle);
          currentMeta = current.optString("meta", "");
          currentDone = current.optBoolean("completed", false);
        }
        if (next != null) {
          nextTitle = next.optString("title", "—");
          nextMeta = next.optString("meta", "");
        } else {
          nextTitle = "Nothing next";
          nextMeta = "";
        }
      } catch (Exception ignored) {
        currentTitle = "Couldn’t read plan";
      }
    }

    views.setTextViewText(R.id.widget_current_title, currentTitle);
    views.setTextViewText(R.id.widget_current_meta, currentMeta);
    views.setTextViewText(R.id.widget_next_title, nextTitle);
    views.setTextViewText(R.id.widget_next_meta, nextMeta);
    views.setViewVisibility(
      R.id.widget_next_meta,
      nextMeta == null || nextMeta.isEmpty() ? View.GONE : View.VISIBLE
    );

    Intent openApp = new Intent(context, MainActivity.class);
    openApp.setAction(Intent.ACTION_VIEW);
    openApp.setData(Uri.parse("app.momentum.plan://tasks/" + (currentId != null ? currentId : "")));
    openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent openPi = PendingIntent.getActivity(
      context,
      appWidgetId,
      openApp,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_root, openPi);

    if (currentId != null && !currentId.isEmpty() && !currentDone) {
      views.setViewVisibility(R.id.widget_complete, View.VISIBLE);
      Intent complete = new Intent(context, MomentumWidgetProvider.class);
      complete.setAction(ACTION_COMPLETE);
      complete.putExtra(EXTRA_TASK_ID, currentId);
      complete.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
      PendingIntent completePi = PendingIntent.getBroadcast(
        context,
        appWidgetId * 31 + 7,
        complete,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      views.setOnClickPendingIntent(R.id.widget_complete, completePi);
      views.setContentDescription(R.id.widget_complete, "Mark current task complete");
    } else {
      views.setViewVisibility(R.id.widget_complete, View.GONE);
    }

    Bundle options = manager.getAppWidgetOptions(appWidgetId);
    int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180);
    views.setViewVisibility(R.id.widget_next_block, minWidth < 200 ? View.GONE : View.VISIBLE);

    manager.updateAppWidget(appWidgetId, views);
  }
}
