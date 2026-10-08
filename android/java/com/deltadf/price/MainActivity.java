package com.deltadf.price;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    // WebView 壳：加载三角洲行动价格查询线上应用（https://delta-force-v5.pages.dev/）。
    // 应用内请求走相对路径 /api/*，与线上同源，由 Cloudflare Functions 代理（含限流/来源校验）。
    // 需要联网；建议用系统 Chrome/Safari 也可直接装为 PWA，本 APK 提供独立安装包体验。
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return false; }
            @Override public void onPageFinished(WebView v, String u) { v.setVisibility(View.VISIBLE); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, android.webkit.WebResourceError e) {
                // 加载失败也要显示，否则一直停在隐藏态 → 整屏纯黑，看起来像黑屏闪退
                v.setVisibility(View.VISIBLE);
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        // 加载前先隐藏：页面背景是 #000000（css/base.css），隐藏 + 主题的黑色 windowBackground
        // 组合后从启动到首屏渲染全程纯黑，不会出现「白底一闪再变黑」的割裂感。
        // 原来的 onPageFinished 里 setVisibility(VISIBLE) 是死代码——WebView 默认就可见，
        // 从未先隐藏过，所以那行从来没起过作用。
        web.setVisibility(View.INVISIBLE);
        web.loadUrl("https://delta-force-v5.pages.dev/");
        root.addView(web, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
