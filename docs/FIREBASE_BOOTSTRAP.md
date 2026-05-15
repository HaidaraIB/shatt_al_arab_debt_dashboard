# Firebase bootstrap (Spark / no Blaze)

This app uses the **default** Firestore database `(default)`, Google Auth, and role documents in `users/{uid}`. No Cloud Functions are required.

## 1. Firebase Console setup

1. Open [Firebase Console](https://console.firebase.google.com/) for project `gen-lang-client-0367805042` (or your project ID in `.firebaserc`).
2. Stay on the **Spark** plan (do not enable Blaze unless you choose to later).
3. **Authentication** → Sign-in method → enable **Email/Password** (disable public sign-up if the console offers it; only admins create accounts in the app).
4. **Firestore Database** → create database in **production mode** on **`(default)`** if it does not exist.
5. Deploy security rules and indexes from this repo:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   Wait until composite indexes show **Enabled** in the console (required for lawyer queries).

## 2. Migrate data from AI Studio named database (if needed)

If you previously used the named database `ai-studio-797e8da4-...`:

1. Export collections from that database (Console → Firestore → select database → Import/Export, or use `gcloud firestore export`).
2. Import into **`(default)`**.
3. The app no longer uses `firestoreDatabaseId` in `firebase-applet-config.json`.

## 3. Create the first admin user

**Option A — Firebase Console (bootstrap once)**

1. **Authentication** → **Users** → **Add user** with email + password.
2. Copy the new user's **UID**.
3. In **Firestore** → `users` collection → **Add document**:
   - **Document ID:** your UID
   - Fields:

     | Field | Type | Value |
     |-------|------|--------|
     | `role` | string | `admin` |
     | `email` | string | your Google email |
     | `displayName` | string | optional |
     | `active` | boolean | `true` |
     | `createdAt` | timestamp | now |

4. Sign out and sign in again. You should see the full dashboard.

## 4. Seed configuration (admin)

In Firestore, create or edit:

**`config/lawyers`**

```json
{ "list": ["اسم المحامي الأول", "اسم المحامي الثاني"] }
```

**`config/statuses`** (optional; app has defaults)

```json
{
  "list": [
    { "value": "none", "label": "لا توجد", "icon": "CheckCircle" },
    { "value": "notified", "label": "تم التبليغ", "icon": "AlertCircle" },
    { "value": "warned", "label": "توجيه إنذار", "icon": "FileText" },
    { "value": "lawsuit", "label": "رفع دعوى قضائية", "icon": "Gavel" }
  ]
}
```

## 5. Add users from the app (admin)

1. Sign in as **admin** with email + password.
2. Open **الإعدادات** → **إنشاء مستخدم جديد**.
3. Fill in: email, password, display name, role (admin / lawyer), lawyer name (if lawyer), active checkbox.
4. Click **إنشاء المستخدم** — the account is saved to Firebase Auth and Firestore immediately.
5. The new user signs in on the login screen with that email and password (no self-registration).

Manage existing users in the list below the form: **تعديل**, **إعادة كلمة المرور** (email link), **تعطيل**.

Lawyers can **only** update legal status and notes on assigned customers.

## 6. Revoke access

Set `active` to `false` on `users/{uid}`. The user will see "غير مصرح" and cannot read data.
