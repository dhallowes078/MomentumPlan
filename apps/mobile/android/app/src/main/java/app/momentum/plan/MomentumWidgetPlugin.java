package app.momentum.plan;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MomentumWidget")
public class MomentumWidgetPlugin extends Plugin {
  @PluginMethod
  public void update(PluginCall call) {
    JSObject payload = call.getObject("payload");
    String token = call.getString("token");
    String apiBase = call.getString("apiBase");

    Context context = getContext();
    SharedPreferences prefs = context.getSharedPreferences(MomentumWidgetProvider.PREFS, Context.MODE_PRIVATE);
    SharedPreferences.Editor editor = prefs.edit();
    if (payload != null) {
      editor.putString(MomentumWidgetProvider.KEY_PAYLOAD, payload.toString());
    }
    if (token != null) {
      if (token.isEmpty()) editor.remove("momentum_device_token");
      else editor.putString("momentum_device_token", token);
    }
    if (apiBase != null) {
      if (apiBase.isEmpty()) editor.remove("momentum_sync_api_url");
      else editor.putString("momentum_sync_api_url", apiBase.replaceAll("/$", ""));
    }
    editor.apply();
    MomentumWidgetProvider.refreshAll(context);
    call.resolve();
  }
}
