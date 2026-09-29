package app.curie.client;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static final List<JSObject> pendingSharedFiles = new ArrayList<>();

    public static void handleIncomingIntent(Intent intent, ContentResolver contentResolver, File cacheDir) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                JSObject fileObj = processUri(uri, type, contentResolver, cacheDir);
                if (fileObj != null) {
                    pendingSharedFiles.add(fileObj);
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null) {
                for (Uri uri : uris) {
                    JSObject fileObj = processUri(uri, type, contentResolver, cacheDir);
                    if (fileObj != null) {
                        pendingSharedFiles.add(fileObj);
                    }
                }
            }
        }
    }

    private static JSObject processUri(Uri uri, String mimeType, ContentResolver contentResolver, File cacheDir) {
        String name = "shared_file";

        try (Cursor cursor = contentResolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIdx != -1) {
                    String queryName = cursor.getString(nameIdx);
                    if (queryName != null && !queryName.isEmpty()) {
                        name = queryName;
                    }
                }
            }
        } catch (Exception ignored) {}

        if ("shared_file".equals(name) && uri.getLastPathSegment() != null) {
            name = uri.getLastPathSegment();
        }

        try {
            File dest = new File(cacheDir, "shared_" + System.currentTimeMillis() + "_" + name);
            try (InputStream in = contentResolver.openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(dest)) {
                if (in != null) {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = in.read(buffer)) != -1) {
                        out.write(buffer, 0, len);
                    }
                }
            }

            JSObject obj = new JSObject();
            obj.put("name", name);
            obj.put("size", dest.length());
            obj.put("mimeType", mimeType != null ? mimeType : "application/octet-stream");
            obj.put("path", dest.getAbsolutePath());
            return obj;
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void getSharedFiles(PluginCall call) {
        JSArray arr = new JSArray();
        for (JSObject obj : pendingSharedFiles) {
            arr.put(obj);
        }
        JSObject ret = new JSObject();
        ret.put("files", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path is required");
            return;
        }
        try {
            File file = new File(path);
            if (!file.exists()) {
                call.reject("File does not exist: " + path);
                return;
            }
            byte[] bytes = Files.readAllBytes(file.toPath());
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("data", base64);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearSharedFiles(PluginCall call) {
        pendingSharedFiles.clear();
        call.resolve();
    }
}
