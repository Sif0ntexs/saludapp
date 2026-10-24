package com.zyvo.saludapp;

import android.app.Activity;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.view.WindowCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends Activity {
    private WebView w;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        w = new WebView(this);
        w.getSettings().setJavaScriptEnabled(true);
        w.getSettings().setDomStorageEnabled(true);   // persistencia localStorage
        w.getSettings().setDatabaseEnabled(true);
        w.setWebViewClient(new WebViewClient());
        w.setBackgroundColor(0xFF0E9F8A);
        setContentView(w);
        ViewCompat.setOnApplyWindowInsetsListener(w, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, sys.top, 0, sys.bottom);
            return insets;
        });
        w.loadUrl("file:///android_asset/index.html");
    }

    @Override public void onBackPressed() {
        if (w != null && w.canGoBack()) w.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (w != null) { ViewGroup vg = (ViewGroup) w.getParent(); if (vg != null) vg.removeView(w); w.destroy(); }
        super.onDestroy();
    }
}
