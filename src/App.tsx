import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Scale,
  FileText,
  AlertCircle,
  CheckCircle,
  Gavel,
  X,
  LogOut,
  LogIn,
  Loader2,
  Trash2,
  Edit2,
  Settings,
  Bell,
  Info,
  Upload,
  FileDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import {
  auth,
  db,
  Customer,
  Payment,
  OperationType,
  handleFirestoreError,
  arrayUnion,
  arrayRemove,
  setDoc,
  type UserProfile,
  type UserRole,
} from './lib/firebase';
import {
  useUserProfile,
  isProfileActive,
  isAdmin,
  isLawyer,
  isSupervisor,
  canViewAllCustomers,
  canManageCustomers,
  canDeleteCustomers,
  canRecordPayments,
  canManageSettings,
  canUpdateStatus,
  canManageUsers,
  canViewLawyerDirectory,
} from './lib/auth';
import {
  adminCreateUser,
  adminUpdateUser,
  adminSetUserPassword,
  mapAuthError,
} from './lib/users-admin';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
  type UpdateData,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import {
  ButtonLoadingContent,
  LoadingFeedback,
  LoadingSpinner,
  useConfirm,
  useSnackbar,
} from './components/feedback';
import { CustomerPrintView } from './components/CustomerPrintView';

// --- Types & Constants ---

const STATUS_COLOR_PALETTE = {
  emerald: {
    badge: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    dot: 'border-emerald-500 text-emerald-500',
    row: 'border-emerald-500',
    swatch: 'bg-emerald-500',
  },
  amber: {
    badge: 'bg-amber-50 border-amber-200 text-amber-700',
    dot: 'border-amber-500 text-amber-500',
    row: 'border-amber-500',
    swatch: 'bg-amber-500',
  },
  orange: {
    badge: 'bg-orange-50 border-orange-200 text-orange-700',
    dot: 'border-orange-500 text-orange-500',
    row: 'border-orange-500',
    swatch: 'bg-orange-500',
  },
  rose: {
    badge: 'bg-rose-50 border-rose-200 text-rose-700',
    dot: 'border-rose-500 text-rose-500',
    row: 'border-rose-500',
    swatch: 'bg-rose-500',
  },
  blue: {
    badge: 'bg-blue-50 border-blue-200 text-blue-700',
    dot: 'border-blue-500 text-blue-500',
    row: 'border-blue-500',
    swatch: 'bg-blue-500',
  },
  purple: {
    badge: 'bg-purple-50 border-purple-200 text-purple-700',
    dot: 'border-purple-500 text-purple-500',
    row: 'border-purple-500',
    swatch: 'bg-purple-500',
  },
  cyan: {
    badge: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    dot: 'border-cyan-500 text-cyan-500',
    row: 'border-cyan-500',
    swatch: 'bg-cyan-500',
  },
  indigo: {
    badge: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    dot: 'border-indigo-500 text-indigo-500',
    row: 'border-indigo-500',
    swatch: 'bg-indigo-500',
  },
  pink: {
    badge: 'bg-pink-50 border-pink-200 text-pink-700',
    dot: 'border-pink-500 text-pink-500',
    row: 'border-pink-500',
    swatch: 'bg-pink-500',
  },
  violet: {
    badge: 'bg-violet-50 border-violet-200 text-violet-700',
    dot: 'border-violet-500 text-violet-500',
    row: 'border-violet-500',
    swatch: 'bg-violet-500',
  },
  teal: {
    badge: 'bg-teal-50 border-teal-200 text-teal-700',
    dot: 'border-teal-500 text-teal-500',
    row: 'border-teal-500',
    swatch: 'bg-teal-500',
  },
  slate: {
    badge: 'bg-slate-50 border-slate-200 text-slate-700',
    dot: 'border-slate-500 text-slate-500',
    row: 'border-slate-200',
    swatch: 'bg-slate-500',
  },
} as const;

type StatusColorKey = keyof typeof STATUS_COLOR_PALETTE;

const STATUS_COLOR_KEYS = Object.keys(STATUS_COLOR_PALETTE) as StatusColorKey[];

const LEGAL_STATUS_OPTIONS: StatusOption[] = [
  { value: 'none', label: 'لا توجد', icon: 'CheckCircle', color: 'emerald' },
  { value: 'notified', label: 'تم التبليغ', icon: 'AlertCircle', color: 'amber' },
  { value: 'warned', label: 'توجيه إنذار', icon: 'FileText', color: 'orange' },
  { value: 'lawsuit', label: 'رفع دعوى قضائية', icon: 'Gavel', color: 'rose' },
];

interface StatusOption {
  value: string;
  label: string;
  icon: string;
  color?: string;
}

function isStatusColorKey(key: string | undefined): key is StatusColorKey {
  return !!key && key in STATUS_COLOR_PALETTE;
}

function getStatusColorKey(status: string, options: StatusOption[]): StatusColorKey {
  const option = options.find((o) => o.value === status);
  if (option?.color && isStatusColorKey(option.color)) return option.color;
  const builtIn = LEGAL_STATUS_OPTIONS.find((o) => o.value === status);
  if (builtIn?.color && isStatusColorKey(builtIn.color)) return builtIn.color;
  return 'slate';
}

function getStatusColorClasses(
  key: StatusColorKey,
  variant: 'badge' | 'dot' | 'row' | 'swatch'
): string {
  return STATUS_COLOR_PALETTE[key][variant];
}

function getStatusDotParts(key: StatusColorKey): { border: string; text: string } {
  const parts = STATUS_COLOR_PALETTE[key].dot.split(' ');
  return {
    border: parts.find((c) => c.startsWith('border-')) ?? 'border-slate-500',
    text: parts.find((c) => c.startsWith('text-')) ?? 'text-slate-500',
  };
}

function normalizeStatusOptions(list: StatusOption[]): StatusOption[] {
  const defaultByValue = Object.fromEntries(LEGAL_STATUS_OPTIONS.map((o) => [o.value, o]));
  return list.map((opt) => ({
    ...opt,
    color: isStatusColorKey(opt.color)
      ? opt.color
      : (defaultByValue[opt.value]?.color ?? 'slate'),
  }));
}

function firstUnusedStatusColor(usedColors: string[]): StatusColorKey {
  return STATUS_COLOR_KEYS.find((key) => !usedColors.includes(key)) ?? 'slate';
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Plus,
  Search,
  Scale,
  FileText,
  AlertCircle,
  CheckCircle,
  Gavel,
  X,
  LogOut,
  LogIn,
  Loader2,
  Trash2,
  Edit2,
  Settings,
  Bell,
  Info,
  Upload,
  FileDown,
  Eye,
  EyeOff,
};

type PasswordInputProps = {
  name?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  inputClassName?: string;
};

function PasswordInput({
  name,
  value,
  onChange,
  required,
  minLength,
  placeholder = '••••••••',
  inputClassName,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const isControlled = value !== undefined;

  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        dir="ltr"
        {...(isControlled ? { value, onChange } : {})}
        className={cn(
          'w-full border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
          inputClassName
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors"
        aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function displayNameForUser(user: FirebaseUser, profile: UserProfile | null): string {
  return profile?.displayName?.trim() || profile?.email || user.email || 'مستخدم';
}

// --- Components ---

function ColorSwatchPicker({
  selected,
  onSelect,
  size = 'md',
}: {
  selected: StatusColorKey;
  onSelect: (key: StatusColorKey) => void;
  size?: 'sm' | 'md';
}) {
  const swatchSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  return (
    <div className="grid grid-cols-6 gap-2">
      {STATUS_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={cn(
            swatchSize,
            'rounded-full shrink-0 mx-auto transition-transform',
            getStatusColorClasses(key, 'swatch'),
            selected === key
              ? 'ring-2 ring-slate-900 ring-offset-2 scale-110'
              : 'hover:scale-105 opacity-80 hover:opacity-100'
          )}
          title={key}
          aria-label={key}
          aria-pressed={selected === key}
        />
      ))}
    </div>
  );
}

function ColorPickerPopover({
  selected,
  onSelect,
  isOpen,
  onClose,
  children,
}: {
  selected: StatusColorKey;
  onSelect: (key: StatusColorKey) => void;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {isOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 cursor-default"
              onClick={onClose}
              aria-label="إغلاق"
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute z-40 top-full mt-2 right-0 w-[11.5rem] p-3 bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/60"
            >
              <p className="text-[10px] font-bold text-slate-400 mb-2.5">اختر اللون</p>
              <ColorSwatchPicker
                size="sm"
                selected={selected}
                onSelect={(key) => {
                  onSelect(key);
                  onClose();
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const StatusBadge = ({ status, options }: { status: string; options: StatusOption[] }) => {
  const option = options.find(o => o.value === status) || { label: status, icon: 'Info' };
  const Icon = ICON_MAP[option.icon] || Info;
  const colorKey = getStatusColorKey(status, options);

  return (
    <div
      className={cn(
        'inline-flex max-w-max flex-nowrap items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border',
        getStatusColorClasses(colorKey, 'badge')
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="whitespace-nowrap">{option.label}</span>
    </div>
  );
};

function StatusFilterChip({
  label,
  count,
  colorKey,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  colorKey: StatusColorKey;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all',
        getStatusColorClasses(colorKey, 'badge'),
        selected
          ? 'border-2 border-slate-900 shadow-sm'
          : 'border opacity-75 hover:opacity-100 hover:shadow-sm'
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none',
          selected ? 'bg-slate-900 text-white' : 'bg-white/70'
        )}
      >
        {count}
      </span>
    </button>
  );
}

function StatusOptionPicker({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: StatusOption[];
}) {
  const [selected, setSelected] = useState(defaultValue);

  useEffect(() => {
    setSelected(defaultValue);
  }, [defaultValue]);

  return (
    <div>
      <input type="hidden" name={name} value={selected} />
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const colorKey = getStatusColorKey(opt.value, options);
          const Icon = ICON_MAP[opt.icon] || Info;
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                getStatusColorClasses(colorKey, 'badge'),
                isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : 'opacity-55 hover:opacity-100'
              )}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(LEGAL_STATUS_OPTIONS);
  const [newStatusColor, setNewStatusColor] = useState<StatusColorKey>('slate');
  const [colorPickerTarget, setColorPickerTarget] = useState<string | null>(null);
  const [configLawyerNames, setConfigLawyerNames] = useState<string[]>([]);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [statusUpdateVisible, setStatusUpdateVisible] = useState(false);
  const [paymentUpdateVisible, setPaymentUpdateVisible] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [appUsers, setAppUsers] = useState<(UserProfile & { id: string })[]>([]);
  const [userFormLoading, setUserFormLoading] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<string | null>(null);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedCustomerIdRef = useRef<string | null>(null);

  const { profile, profileLoading } = useUserProfile(user?.uid);
  const confirmAction = useConfirm();
  const { showSnackbar } = useSnackbar();
  const admin = isAdmin(profile);
  const lawyer = isLawyer(profile);
  const supervisor = isSupervisor(profile);
  const showPayments = canRecordPayments(profile);
  const showCustomerForm = canManageCustomers(profile);
  const showDeleteCustomer = canDeleteCustomers(profile);

  const customersSubscriptionEnabled =
    Boolean(user) && !profileLoading && isProfileActive(profile);
  const customersQuery = useMemo(() => {
    if (!customersSubscriptionEnabled || !profile) return null;
    if (canViewAllCustomers(profile)) {
      return query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    }
    if (profile.lawyerName) {
      return query(
        collection(db, 'customers'),
        where('lawyerName', '==', profile.lawyerName),
        orderBy('createdAt', 'desc')
      );
    }
    return null;
  }, [customersSubscriptionEnabled, profile]);

  const paymentsSubscriptionEnabled =
    Boolean(selectedCustomer?.id) && isProfileActive(profile);
  const usersSubscriptionEnabled = Boolean(user) && canViewLawyerDirectory(profile);

  const visibleCustomers = useMemo(
    () => (customersSubscriptionEnabled && customersQuery ? customers : []),
    [customersSubscriptionEnabled, customersQuery, customers]
  );
  const visiblePayments = useMemo(
    () => (paymentsSubscriptionEnabled ? payments : []),
    [paymentsSubscriptionEnabled, payments]
  );
  const visibleAppUsers = useMemo(
    () => (usersSubscriptionEnabled ? appUsers : []),
    [usersSubscriptionEnabled, appUsers]
  );

  const editingUser = editingUserId
    ? visibleAppUsers.find((u) => u.id === editingUserId) ?? null
    : null;

  const lawyerNames = useMemo(() => {
    const names = new Set<string>();
    configLawyerNames.forEach((n) => {
      const trimmed = n.trim();
      if (trimmed) names.add(trimmed);
    });
    visibleAppUsers
      .filter((u) => u.role === 'lawyer' && u.active)
      .forEach((u) => {
        const n = (u.lawyerName || u.displayName)?.trim();
        if (n) names.add(n);
      });
    visibleCustomers.forEach((c) => {
      if (c.lawyerName?.trim()) names.add(c.lawyerName.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [configLawyerNames, visibleAppUsers, visibleCustomers]);

  useEffect(() => {
    selectedCustomerIdRef.current = selectedCustomer?.id ?? null;
  }, [selectedCustomer?.id]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(
        auth,
        loginEmail.trim().toLowerCase(),
        loginPassword
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
      const msg = mapAuthError(code);
      setLoginError(msg);
      showSnackbar(msg, 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    const ok = await confirmAction({
      title: 'تسجيل الخروج',
      message: 'هل تريد إنهاء الجلسة وتسجيل الخروج؟',
      confirmLabel: 'تسجيل الخروج',
      cancelLabel: 'إلغاء',
      variant: 'danger',
    });
    if (!ok) return;
    void signOut(auth);
  };

  useEffect(() => {
    if (!customersQuery) return;

    return onSnapshot(
      customersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Customer[];
        setCustomers(data);
        const selectedId = selectedCustomerIdRef.current;
        if (selectedId) {
          const updated = data.find((c) => c.id === selectedId);
          if (updated) setSelectedCustomer(updated);
          else setSelectedCustomer(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'customers');
      }
    );
  }, [customersQuery]);

  useEffect(() => {
    if (!paymentsSubscriptionEnabled || !selectedCustomer?.id) return;

    const paymentsQuery = query(
      collection(db, 'customers', selectedCustomer.id, 'payments'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(paymentsQuery, (snapshot) => {
      setPayments(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Payment[]
      );
    });
  }, [paymentsSubscriptionEnabled, selectedCustomer?.id]);

  useEffect(() => {
    if (!user || !isProfileActive(profile)) return;

    const unsubStatuses = onSnapshot(doc(db, 'config', 'statuses'), (snap) => {
      if (snap.exists()) {
        const list = normalizeStatusOptions(snap.data().list || LEGAL_STATUS_OPTIONS);
        setStatusOptions(list);
        setNewStatusColor(firstUnusedStatusColor(list.map((o) => o.color ?? 'slate')));
      }
    });

    const unsubLawyers = onSnapshot(doc(db, 'config', 'lawyers'), (snap) => {
      if (!snap.exists()) {
        setConfigLawyerNames([]);
        return;
      }
      const list = snap.data().list;
      if (!Array.isArray(list)) {
        setConfigLawyerNames([]);
        return;
      }
      setConfigLawyerNames(
        list.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      );
    });

    return () => {
      unsubStatuses();
      unsubLawyers();
    };
  }, [user, profile]);

  useEffect(() => {
    if (!isSettingsOpen) setColorPickerTarget(null);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!usersSubscriptionEnabled) return;

    return onSnapshot(collection(db, 'users'), (snap) => {
      setAppUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserProfile) })));
    });
  }, [usersSubscriptionEnabled]);

  // --- Actions ---

  const handleSaveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !showCustomerForm) return;
    setFormLoading(true);

    const actor = displayNameForUser(user, profile);
    const formData = new FormData(e.currentTarget);
    const legalStatus = formData.get('legalStatus') as Customer['legalStatus'];
    const lastContactNotes = formData.get('lastContactNotes') as string;
    const data: UpdateData<Customer> = {
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      unitNumber: formData.get('unitNumber') as string,
      delayedInstallments: Number(formData.get('delayedInstallments')),
      remainingBalance: Number(formData.get('remainingBalance')),
      lastInstallmentDate: formData.get('lastInstallmentDate') as string,
      lastInstallmentAmount: Number(formData.get('lastInstallmentAmount')),
      legalStatus,
      lawyerName: formData.get('lawyerName') as string,
      lastContactNotes,
      updatedAt: serverTimestamp(),
    };

    try {
      if (activeCustomer?.id) {
        if (activeCustomer.legalStatus !== legalStatus) {
          data.statusHistory = arrayUnion({
            status: legalStatus,
            notes: `تغيير الحالة من النموذج الرئيسي: ${lastContactNotes || 'بدون ملاحظات'}`,
            updatedBy: actor,
            timestamp: new Date().toISOString(),
          });
        }
        await updateDoc(doc(db, 'customers', activeCustomer.id), data);
      } else {
        data.createdAt = serverTimestamp();
        data.statusHistory = [
          {
            status: legalStatus,
            notes: 'إضافة الزبون للنظام لأول مرة',
            updatedBy: actor,
            timestamp: new Date().toISOString(),
          },
        ];
        await addDoc(collection(db, 'customers'), data);
      }
      setIsModalOpen(false);
      setActiveCustomer(null);
      showSnackbar(
        activeCustomer?.id ? 'تم تحديث بيانات الزبون' : 'تمت إضافة الزبون',
        'success'
      );
    } catch (error) {
      try {
        handleFirestoreError(error, activeCustomer ? OperationType.UPDATE : OperationType.CREATE, 'customers');
      } catch {
        showSnackbar('تعذر حفظ بيانات الزبون.', 'error');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handlePaymentUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer?.id || !showPayments || !user) return;
    setFormLoading(true);

    const actor = displayNameForUser(user, profile);
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const date = formData.get('date') as string;
    const notes = formData.get('notes') as string;

    try {
      const newRemainingBalance = Math.max(0, selectedCustomer.remainingBalance - amount);
      const newDelayedInstallments = Math.max(0, selectedCustomer.delayedInstallments - 1);
      const customerRef = doc(db, 'customers', selectedCustomer.id);
      const paymentRef = doc(collection(db, 'customers', selectedCustomer.id, 'payments'));

      const batch = writeBatch(db);
      batch.set(paymentRef, {
        amount,
        paidAt: date,
        notes: notes || '',
        recordedBy: actor,
        createdAt: serverTimestamp(),
      });
      batch.update(customerRef, {
        remainingBalance: newRemainingBalance,
        delayedInstallments: newDelayedInstallments,
        lastInstallmentAmount: amount,
        lastInstallmentDate: date,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: selectedCustomer.legalStatus,
          notes: `تم استلام دفعة مالية بقيمة ${amount.toLocaleString()} د.ع بتاريخ ${date}. ${notes}`,
          updatedBy: actor,
          timestamp: new Date().toISOString(),
        }),
      });
      await batch.commit();
      setPaymentUpdateVisible(false);
      showSnackbar('تم تسجيل الدفعة بنجاح', 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `customers/${selectedCustomer.id}`);
      } catch {
        showSnackbar('تعذر تسجيل الدفعة.', 'error');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const parseExcelRow = (
    row: ExcelJS.Row,
    colIndex: Record<string, number>
  ): Partial<Customer> | null => {
    const cell = (key: string) => {
      const idx = colIndex[key];
      if (idx === undefined) return '';
      const v = row.getCell(idx).value;
      if (v == null) return '';
      if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text);
      return String(v);
    };
    const name = cell('name');
    const unitNumber = cell('unit');
    if (!name || !unitNumber) return null;
    const statusRaw = cell('status') || 'none';
    const legalStatus = ['none', 'notified', 'warned', 'lawsuit'].includes(statusRaw)
      ? (statusRaw as Customer['legalStatus'])
      : 'none';
    return {
      name,
      phone: cell('phone'),
      unitNumber,
      delayedInstallments: Number(cell('delayed')) || 0,
      remainingBalance: Number(cell('balance')) || 0,
      lawyerName: cell('lawyer'),
      legalStatus,
    };
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !admin) return;

    setImportLoading(true);
    const actor = displayNameForUser(user, profile);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('لا يوجد ورقة بيانات في الملف');

      const headerRow = sheet.getRow(1);
      const colIndex: Record<string, number> = {};
      headerRow.eachCell((cell, colNumber) => {
        const h = String(cell.value ?? '')
          .trim()
          .toLowerCase();
        if (h === 'name' || h === 'الاسم') colIndex.name = colNumber;
        else if (h === 'phone' || h === 'الهاتف') colIndex.phone = colNumber;
        else if (h === 'unit' || h === 'الوحدة') colIndex.unit = colNumber;
        else if (h === 'delayed' || h === 'التأخير') colIndex.delayed = colNumber;
        else if (h === 'balance' || h === 'المبلغ') colIndex.balance = colNumber;
        else if (h === 'lawyer' || h === 'المحامي') colIndex.lawyer = colNumber;
        else if (h === 'status' || h === 'الحالة') colIndex.status = colNumber;
      });

      let importedCount = 0;
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const parsed = parseExcelRow(row, colIndex);
        if (!parsed) continue;

        const customer: Partial<Customer> = {
          ...parsed,
          lastContactNotes: 'مستورد من ملف إكسل',
          createdAt: serverTimestamp() as Customer['createdAt'],
          updatedAt: serverTimestamp() as Customer['updatedAt'],
          statusHistory: [
            {
              status: parsed.legalStatus ?? 'none',
              notes: 'تمت الإضافة عبر استيراد إكسل',
              updatedBy: actor,
              timestamp: new Date().toISOString(),
            },
          ],
        };
        await addDoc(collection(db, 'customers'), customer);
        importedCount++;
      }
      showSnackbar(`تم استيراد ${importedCount} زبون بنجاح`, 'success');
    } catch (error) {
      console.error('Import error:', error);
      showSnackbar('فشل استيراد الملف. تأكد من صحة البيانات.', 'error');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers Template');
    sheet.addRow(['الاسم', 'الهاتف', 'الوحدة', 'التأخير', 'المبلغ', 'المحامي', 'الحالة']);
    sheet.addRow(['أحمد علي', '07800000000', 'Z1-101', 3, 15000000, 'مخلص الوائلي', 'warned']);
    sheet.addRow(['سارة محمد', '07700000000', 'Z1-502', 1, 5000000, '', 'notified']);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Shatt_AlArab_Template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!showDeleteCustomer) return;
    const ok = await confirmAction({
      title: 'حذف الزبون',
      message: 'هل أنت متأكد من حذف معلومات هذا الزبون؟',
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      showSnackbar('تم حذف الزبون', 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
      } catch {
        showSnackbar('تعذر حذف الزبون. حاول مرة أخرى.', 'error');
      }
    }
  };

  const handleQuickStatusUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer?.id || !user || !canUpdateStatus(profile)) return;
    setFormLoading(true);

    const actor = displayNameForUser(user, profile);
    const formData = new FormData(e.currentTarget);
    const newStatus = formData.get('legalStatus') as Customer['legalStatus'];
    const notes = formData.get('notes') as string;

    try {
      await updateDoc(doc(db, 'customers', selectedCustomer.id), {
        legalStatus: newStatus,
        lastContactNotes: notes,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: newStatus,
          notes: notes || 'تحديث حالة سريع',
          updatedBy: actor,
          timestamp: new Date().toISOString(),
        }),
      });
      setStatusUpdateVisible(false);
      showSnackbar('تم تحديث الحالة', 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `customers/${selectedCustomer.id}`);
      } catch {
        showSnackbar('تعذر تحديث الحالة.', 'error');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!admin) return;
    const form = e.currentTarget;
    setUserFormLoading(true);
    setUserFormError(null);

    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');
    const displayName = String(formData.get('displayName') ?? '').trim();
    const role = String(formData.get('role') ?? 'lawyer') as UserRole;
    const active = formData.get('active') === 'on';

    if (role === 'lawyer' && !displayName) {
      const msg = 'الاسم مطلوب لحساب المحامي';
      setUserFormError(msg);
      showSnackbar(msg, 'error');
      setUserFormLoading(false);
      return;
    }

    try {
      if (editingUserId) {
        await adminUpdateUser(editingUserId, {
          displayName,
          role,
          active,
        });
        setEditingUserId(null);
        showSnackbar('تم تحديث بيانات المستخدم', 'success');
      } else {
        if (!email) throw new Error('البريد الإلكتروني مطلوب');
        if (password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        if (password !== confirmPassword) throw new Error('كلمتا المرور غير متطابقتين');
        await adminCreateUser({
          email,
          password,
          displayName,
          role,
          active,
        });
        form.reset();
        showSnackbar('تم إنشاء المستخدم', 'success');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل حفظ المستخدم';
      setUserFormError(msg);
      showSnackbar(msg, 'error');
    } finally {
      setUserFormLoading(false);
    }
  };

  const handleDeactivateUser = async (uid: string) => {
    if (!admin || uid === user?.uid) return;
    const ok = await confirmAction({
      title: 'تعطيل المستخدم',
      message: 'هل تريد تعطيل هذا المستخدم؟',
      confirmLabel: 'تعطيل',
      cancelLabel: 'إلغاء',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'users', uid), { active: false });
      showSnackbar('تم تعطيل المستخدم', 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      } catch {
        showSnackbar('تعذر تعطيل المستخدم.', 'error');
      }
    }
  };

  const handleActivateUser = async (uid: string) => {
    if (!admin) return;
    const ok = await confirmAction({
      title: 'تفعيل المستخدم',
      message: 'هل تريد تفعيل هذا المستخدم؟',
      confirmLabel: 'تفعيل',
      cancelLabel: 'إلغاء',
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'users', uid), { active: true });
      showSnackbar('تم تفعيل المستخدم', 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      } catch {
        showSnackbar('تعذر تفعيل المستخدم.', 'error');
      }
    }
  };

  const handleSetUserPassword = async (
    e: React.FormEvent<HTMLFormElement>,
    uid: string
  ) => {
    e.preventDefault();
    if (!admin) return;
    const form = e.currentTarget;
    setPasswordResetLoading(true);
    setPasswordResetError(null);

    const formData = new FormData(form);
    const password = String(formData.get('newPassword') ?? '');
    const confirmPassword = String(formData.get('confirmNewPassword') ?? '');

    if (password.length < 6) {
      const msg = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
      setPasswordResetError(msg);
      showSnackbar(msg, 'error');
      setPasswordResetLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      const msg = 'كلمتا المرور غير متطابقتين';
      setPasswordResetError(msg);
      showSnackbar(msg, 'error');
      setPasswordResetLoading(false);
      return;
    }

    try {
      await adminSetUserPassword(uid, password);
      setResettingPasswordUserId(null);
      form.reset();
      showSnackbar('تم تحديث كلمة المرور بنجاح', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل تحديث كلمة المرور';
      setPasswordResetError(msg);
      showSnackbar(msg, 'error');
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleAddStatus = async (label: string) => {
    if (!canManageSettings(profile) || !label) return;
    const value = label.trim().toLowerCase().replace(/\s+/g, '_');
    if (statusOptions.find((o) => o.value === value)) {
      showSnackbar('هذه الحالة موجودة مسبقاً', 'info');
      return;
    }

    const newStatus: StatusOption = {
      value,
      label,
      icon: 'Bell',
      color: newStatusColor,
    };

    try {
      await setDoc(
        doc(db, 'config', 'statuses'),
        { list: arrayUnion(newStatus) },
        { merge: true }
      );
      setNewStatusColor(firstUnusedStatusColor([...statusOptions.map((o) => o.color ?? 'slate'), newStatusColor]));
      showSnackbar(`تمت إضافة الحالة: ${label.trim()}`, 'success');
    } catch (error) {
      console.error(error);
      showSnackbar('تعذر إضافة الحالة. حاول مرة أخرى.', 'error');
    }
  };

  const handleUpdateStatusColor = async (value: string, colorKey: StatusColorKey) => {
    if (!canManageSettings(profile)) return;
    const updatedList = statusOptions.map((o) =>
      o.value === value ? { ...o, color: colorKey } : o
    );

    try {
      await setDoc(
        doc(db, 'config', 'statuses'),
        { list: updatedList },
        { merge: true }
      );
    } catch (error) {
      console.error(error);
      showSnackbar('تعذر تحديث لون الحالة.', 'error');
    }
  };

  const handleRemoveStatus = async (value: string) => {
    if (!canManageSettings(profile)) return;
    const statusToRemove = statusOptions.find((o) => o.value === value);
    if (!statusToRemove) return;

    const ok = await confirmAction({
      title: 'حذف حالة المتابعة',
      message: `هل تريد حذف الحالة «${statusToRemove.label}»؟ لن تختفي هذه القيمة من سجلات الزبائن القديمة، لكن ستُزال من قائمة الخيارات.`,
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await setDoc(
        doc(db, 'config', 'statuses'),
        { list: arrayRemove(statusToRemove) },
        { merge: true }
      );
      showSnackbar('تم حذف الحالة', 'success');
    } catch (error) {
      console.error(error);
      showSnackbar('تعذر حذف الحالة.', 'error');
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(
      statusOptions.map((o) => [o.value, 0])
    );
    for (const c of visibleCustomers) {
      if (c.legalStatus in counts) counts[c.legalStatus]++;
    }
    return counts;
  }, [visibleCustomers, statusOptions]);

  const filteredCustomers = useMemo(
    () =>
      visibleCustomers.filter((c) => {
        const matchesSearch =
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.unitNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone.includes(searchTerm);
        const matchesStatus = statusFilter === null || c.legalStatus === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [visibleCustomers, searchTerm, statusFilter]
  );

  const isTableFiltered = statusFilter !== null || searchTerm.trim().length > 0;

  // --- Render Helpers ---

  if (loading || (user && profileLoading)) {
    return (
      <motion.div className="flex h-screen w-full items-center justify-center bg-slate-50" dir="rtl">
        <LoadingFeedback size="lg" layout="stack" />
      </motion.div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6 text-right" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Scale className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">إدارة ديون الزون الأول</h1>
          <p className="text-slate-500 mb-6 leading-relaxed">
            مرحباً بك في نظام إدارة الزبائن المتأخرين. سجّل الدخول بحسابك الذي أنشأه المسؤول.
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                required
                dir="ltr"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                كلمة المرور
              </label>
              <PasswordInput
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                inputClassName="bg-slate-50 py-3"
              />
            </div>
            {loginError && <p className="text-xs text-rose-600 font-medium">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {loginLoading ? <LoadingSpinner size="md" tone="inherit" /> : <LogIn className="w-5 h-5" />}
              تسجيل الدخول
            </button>
          </form>
          <p className="text-[10px] text-slate-400 mt-6 text-center">
            لا يمكن التسجيل ذاتياً — يُنشئ المسؤول الحسابات فقط.
          </p>
        </div>
      </div>
    );
  }

  if (!isProfileActive(profile)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6 text-right" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200 text-center">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <AlertCircle className="text-rose-600 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">غير مصرح</h1>
          <p className="text-slate-500 mb-6 leading-relaxed">
            حسابك غير مسجل في النظام أو تم تعطيله. يرجى التواصل مع المسؤول لإضافة صلاحياتك.
          </p>
          <p className="text-xs text-slate-400 font-mono mb-6" dir="ltr">
            {user.email}
          </p>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 px-4 rounded-xl font-medium"
          >
            <LogOut className="w-5 h-5" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  const totalBalance = visibleCustomers.reduce((sum, c) => sum + c.remainingBalance, 0);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans" dir="rtl">
      {/* Top Header Navigation */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-8 shrink-0 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500 rounded flex items-center justify-center font-bold text-xl">S</div>
          <h1 className="text-xl font-bold tracking-tight hidden sm:block">مدينة شط العرب السكنية | الزون الأول</h1>
          <h1 className="text-xl font-bold tracking-tight sm:hidden">الزون الأول</h1>
        </div>
        
        <div className="flex gap-8 items-center text-sm">
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">إجمالي المبالغ المتأخرة</span>
            <span className="text-emerald-400 font-mono text-lg font-bold">{totalBalance.toLocaleString()} د.ع</span>
          </div>
          {showCustomerForm && (
            <button
              onClick={() => {
                setActiveCustomer(null);
                setIsModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-md font-bold flex items-center gap-2 transition-colors shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">إضافة زبون جديد</span>
              <span className="sm:hidden">إضافة</span>
            </button>
          )}

          {admin && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx, .xls"
                onChange={handleExcelImport}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importLoading}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md font-bold flex items-center gap-2 transition-colors border border-slate-700 disabled:opacity-50"
                title="استيراد من إكسل"
              >
                {importLoading ? <LoadingSpinner size="sm" tone="inherit" /> : <Upload className="w-4 h-4" />}
                <span className="hidden md:inline">استيراد</span>
              </button>
            </>
          )}

          {supervisor && (
            <span className="text-sky-300 text-xs font-bold hidden md:inline">مشرف</span>
          )}

          {lawyer && profile?.lawyerName && (
            <span className="text-emerald-300 text-xs font-bold hidden md:inline">
              محامي: {profile.lawyerName}
            </span>
          )}

          <div className="flex items-center gap-4">
            {canManageSettings(profile) && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                title="الإعدادات"
              >
                <Settings className="w-5 h-5" />
                <span className="hidden md:inline text-xs font-bold uppercase tracking-widest">الإعدادات</span>
              </button>
            )}
            <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Sub-Header Stats */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="grid grid-cols-2 gap-4 p-4 pb-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">عدد المتلكأين</div>
            <div className="text-2xl font-bold font-mono">
              {visibleCustomers.length}{' '}
              <span className="text-xs font-sans text-slate-400">زبون</span>
            </div>
          </div>
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
            <div className="text-blue-700 text-[10px] uppercase tracking-widest font-bold mb-1">متابعات المحامين</div>
            <div className="text-2xl font-bold text-blue-700 font-mono">
              {new Set(visibleCustomers.map((c) => c.lawyerName).filter(Boolean)).size}{' '}
              <span className="text-xs font-sans">محامين</span>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-1 border-t border-slate-100">
          <div className="flex items-center justify-between gap-3 mb-3 pt-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">فلترة حسب الحالة</span>
            {isTableFiltered && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(null);
                  setSearchTerm('');
                }}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-900 transition-colors"
              >
                إعادة تعيين الفلاتر
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto py-1 custom-scrollbar">
            <StatusFilterChip
              label="الكل"
              count={visibleCustomers.length}
              colorKey="slate"
              selected={statusFilter === null}
              onClick={() => setStatusFilter(null)}
            />
            {statusOptions.map((opt) => (
              <React.Fragment key={opt.value}>
                <StatusFilterChip
                  label={opt.label}
                  count={statusCounts[opt.value] ?? 0}
                  colorKey={getStatusColorKey(opt.value, statusOptions)}
                  selected={statusFilter === opt.value}
                  onClick={() => setStatusFilter(statusFilter === opt.value ? null : opt.value)}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Data Grid Container */}
        <section className="flex-1 border-l border-slate-200 flex flex-col bg-white overflow-hidden">
          <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">جدول المتابعة اليومية</span>
              <span className="text-[10px] font-bold text-slate-500 font-mono">
                عرض {filteredCustomers.length}
                {isTableFiltered ? ` من ${visibleCustomers.length}` : ''} زبون
              </span>
            </div>
            <div className="relative group w-full sm:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <input 
                type="text" 
                placeholder="بحث بالاسم أو رقم الوحدة..." 
                className="w-full text-xs border border-slate-200 rounded-lg pr-9 pl-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-right border-collapse">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                <tr>
                  <th className="p-3 text-slate-500 font-bold text-xs">الزبون</th>
                  <th className="p-3 text-slate-500 font-bold text-xs text-center">رقم الوحدة</th>
                  <th className="p-3 text-slate-500 font-bold text-xs text-center">التلكؤ</th>
                  <th className="p-3 text-slate-500 font-bold text-xs">المبلغ المتبقي</th>
                  <th className="p-3 text-slate-500 font-bold text-xs whitespace-nowrap">الحالة القانونية</th>
                  <th className="p-3 text-slate-500 font-bold text-xs"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((c) => (
                  <tr 
                    key={c.id} 
                    onClick={() => setSelectedCustomer(c)}
                    className={cn(
                      "hover:bg-slate-50 cursor-pointer border-r-4 transition-all",
                      selectedCustomer?.id === c.id
                        ? "bg-emerald-50/30 border-emerald-500"
                        : getStatusColorClasses(getStatusColorKey(c.legalStatus, statusOptions), 'row')
                    )}
                  >
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono tracking-tighter">{c.phone}</div>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-600">{c.unitNumber}</td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "font-bold font-mono",
                        c.delayedInstallments >= 4 ? "text-red-600" :
                        c.delayedInstallments >= 2 ? "text-amber-600" : 
                        "text-slate-400"
                      )}>
                        {c.delayedInstallments} دفعات
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">{c.remainingBalance.toLocaleString()} د.ع</td>
                    <td className="p-3 whitespace-nowrap">
                      <StatusBadge status={c.legalStatus} options={statusOptions} />
                    </td>
                    <td className="p-3 text-left">
                      <button className="text-emerald-600 hover:underline text-xs font-bold">التفاصيل</button>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                      {isTableFiltered ? 'لا توجد بيانات مطابقة للفلتر الحالي' : 'لا توجد بيانات مطابقة لهذا البحث'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detail Panel */}
        <aside className={cn(
          "bg-white flex flex-col border-r border-slate-200 transition-all h-full duration-300 overflow-hidden",
          selectedCustomer ? "w-80 md:w-96" : "w-0 opacity-0"
        )}>
          {selectedCustomer && (
            <>
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-lg text-slate-900 leading-tight">{selectedCustomer.name}</h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">ملف المتابعة القانونية | {selectedCustomer.unitNumber}</p>
                  <div className="mt-2">
                    <StatusBadge status={selectedCustomer.legalStatus} options={statusOptions} />
                  </div>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-slate-300 hover:text-slate-900 shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
                <section>
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-2">آخر دفعة مسددة</label>
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <div className="flex justify-between items-center font-bold text-sm text-blue-900">
                      <span className="font-mono">{(selectedCustomer.lastInstallmentAmount || 0).toLocaleString()} د.ع</span>
                      <span className="text-xs">{selectedCustomer.lastInstallmentDate || 'غير مسجل'}</span>
                    </div>
                  </div>
                  {visiblePayments.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {visiblePayments.slice(0, 5).map((p) => (
                        <div
                          key={p.id}
                          className="text-[10px] flex justify-between text-slate-500 font-mono border-b border-slate-100 pb-1"
                        >
                          <span>{p.amount.toLocaleString()} د.ع</span>
                          <span>{p.paidAt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-2">المحامي المتابع</label>
                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold">
                      {selectedCustomer.lawyerName?.charAt(0) || <Gavel className="w-4 h-4" />}
                    </div>
                    <div className="text-sm">
                      <div className="font-bold text-slate-900">{selectedCustomer.lawyerName || 'لم يتم تحديد محامي'}</div>
                      <div className="text-[10px] text-slate-400 font-medium">متابعة الزون الأول</div>
                    </div>
                  </div>
                </section>

                <section>
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-2">ملاحظات التواصل الأخير</label>
                  <div className="text-xs bg-amber-50 p-4 rounded-xl border border-amber-100 text-slate-700 leading-relaxed italic shadow-sm">
                    {selectedCustomer.lastContactNotes || 'لا توجد ملاحظات مسجلة لآخر تواصل...'}
                  </div>
                </section>

                <section className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase tracking-wide">رقم الهاتف</span>
                    <span className="font-mono font-bold text-slate-700">{selectedCustomer.phone}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase tracking-wide">تاريخ الإضافة</span>
                    <span className="font-mono text-slate-500">
                      {selectedCustomer.createdAt ? format(selectedCustomer.createdAt.toDate(), 'yyyy/MM/dd') : '-'}
                    </span>
                  </div>
                </section>

                <section>
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">السجل الزمني للتحديثات</label>
                    <div className="flex gap-2">
                      {showPayments && (
                        <button
                          onClick={() => {
                            setPaymentUpdateVisible(!paymentUpdateVisible);
                            setStatusUpdateVisible(false);
                          }}
                          className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded-md font-bold hover:bg-emerald-500 transition-colors"
                        >
                          {paymentUpdateVisible ? 'إلغاء' : 'إضافة دفعة'}
                        </button>
                      )}
                      {canUpdateStatus(profile) && (
                        <button
                          onClick={() => {
                            setStatusUpdateVisible(!statusUpdateVisible);
                            setPaymentUpdateVisible(false);
                          }}
                          className="text-[10px] bg-slate-900 text-white px-2 py-1 rounded-md font-bold hover:bg-slate-800 transition-colors"
                        >
                          {statusUpdateVisible ? 'إلغاء' : 'تحديث الحالة'}
                        </button>
                      )}
                    </div>
                  </div>

                  {paymentUpdateVisible && (
                    <motion.form 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      onSubmit={handlePaymentUpdate}
                      className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-3 shadow-sm"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-emerald-700 block mb-1">المبلغ</label>
                          <input 
                            name="amount"
                            type="number"
                            required
                            placeholder="المبلغ..."
                            className="w-full text-xs border border-emerald-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-emerald-700 block mb-1">التاريخ</label>
                          <input 
                            name="date"
                            type="date"
                            required
                            defaultValue={format(new Date(), 'yyyy-MM-dd')}
                            className="w-full text-xs border border-emerald-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>
                      <textarea 
                        name="notes"
                        placeholder="ملاحظات إضافية..."
                        rows={2}
                        className="w-full text-xs border border-emerald-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                      />
                      <button 
                        type="submit"
                        disabled={formLoading}
                        className="w-full bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 transition-all shadow-md shadow-emerald-200"
                      >
                        <ButtonLoadingContent loading={formLoading} loadingText="جاري الحفظ...">
                          تثبيت الدفعة
                        </ButtonLoadingContent>
                      </button>
                    </motion.form>
                  )}

                  {statusUpdateVisible && (
                    <motion.form 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      onSubmit={handleQuickStatusUpdate}
                      className="mb-6 p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-sm"
                    >
                      <div key={selectedCustomer.id}>
                        <StatusOptionPicker
                          name="legalStatus"
                          defaultValue={selectedCustomer.legalStatus}
                          options={statusOptions}
                        />
                      </div>
                      <textarea 
                        name="notes"
                        placeholder="ملاحظات التحديث..."
                        rows={2}
                        className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10 resize-none"
                      />
                      <button 
                        type="submit"
                        disabled={formLoading}
                        className="w-full bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 transition-all"
                      >
                        <ButtonLoadingContent loading={formLoading} loadingText="جاري الحفظ...">
                          تثبيت التحديث
                        </ButtonLoadingContent>
                      </button>
                    </motion.form>
                  )}

                  <div className="space-y-4">
                    {selectedCustomer.statusHistory && selectedCustomer.statusHistory.length > 0 ? (
                      selectedCustomer.statusHistory.slice().reverse().map((entry, idx) => {
                        const date = new Date(entry.timestamp);
                        const entryColorKey = getStatusColorKey(entry.status, statusOptions);
                        const dotParts = getStatusDotParts(entryColorKey);

                        return (
                          <div key={idx} className="relative pr-6 before:absolute before:right-2 before:top-2 before:bottom-0 before:w-px before:bg-slate-100 last:before:hidden">
                            <div className={cn("absolute right-0 top-1 w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center", dotParts.border)}>
                              {(() => {
                                const opt = statusOptions.find(o => o.value === entry.status);
                                const Icon = ICON_MAP[opt?.icon || 'Info'] || Info;
                                return <Icon className={cn("w-2 h-2", dotParts.text)} />;
                              })()}
                            </div>
                            <div className="flex justify-between items-start mb-1 text-[10px] font-mono text-slate-400">
                              <span>{format(date, 'yyyy/MM/dd HH:mm')}</span>
                              <span className="font-sans font-bold">{entry.updatedBy}</span>
                            </div>
                            <StatusBadge status={entry.status} options={statusOptions} />
                            {entry.notes && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{entry.notes}</p>}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[10px] text-slate-300 italic text-center py-4 border border-dashed border-slate-100 rounded-xl">لا يوجد سجل تاريخي متوفر</div>
                    )}
                  </div>
                </section>
              </div>

              <div className="p-5 border-t border-slate-200 bg-white grid grid-cols-2 gap-3">
                {showCustomerForm && (
                  <button
                    onClick={() => {
                      setActiveCustomer(selectedCustomer);
                      setIsModalOpen(true);
                    }}
                    className="bg-slate-900 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    تعديل الملف
                  </button>
                )}
                <button 
                  className="border border-slate-200 text-slate-600 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  onClick={() => window.print()}
                >
                  <FileText className="w-3.5 h-3.5" />
                  طباعة
                </button>
                {showDeleteCustomer && selectedCustomer.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomer(selectedCustomer.id!)}
                    className="border border-rose-200 text-rose-600 py-2.5 rounded-lg text-xs font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-8 bg-slate-900 border-t border-slate-700 flex items-center px-4 justify-between text-[10px] text-slate-400 font-bold uppercase tracking-widest shrink-0">
        <div>نظام إدارة الديون والمتابعة القانونية - الإصدار 1.2.0</div>
        <div className="flex gap-6 items-center">
          <div className="flex gap-2 items-center">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span>متصل بالخادم</span>
          </div>
          <span>المستخدم: {displayNameForUser(user, profile)}</span>
          <span>{format(new Date(), 'HH:mm')} ص</span>
        </div>
      </footer>

      {/* Modal / Form - Keep as is but styling tweak */}
      <AnimatePresence>
        {isModalOpen && showCustomerForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto border border-slate-100"
              dir="rtl"
            >
              {/* Form Content (Previous Implementation but with consistent themed inputs) */}
              <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">
                  {activeCustomer ? 'تعديل معلومات الزبون' : 'إضافة زبون جديد'}
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">الاسم الكامل</label>
                      <input 
                        name="name" 
                        required 
                        defaultValue={activeCustomer?.name}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                        placeholder="أدخل اسم الزبون..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">رقم الهاتف</label>
                      <input 
                        name="phone" 
                        required 
                        defaultValue={activeCustomer?.phone}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                        placeholder="07XXXXXXXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">رقم الوحدة السكنية</label>
                      <input 
                        name="unitNumber" 
                        required 
                        defaultValue={activeCustomer?.unitNumber}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                        placeholder="Z1-XXX"
                      />
                    </div>
                  </div>

                  {/* Financial Info */}
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">العجز (دفعات)</label>
                        <input 
                          type="number"
                          name="delayedInstallments" 
                          required 
                          min="0"
                          defaultValue={activeCustomer?.delayedInstallments || 0}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">المبلغ المتبقي</label>
                        <input 
                          type="number"
                          name="remainingBalance" 
                          required 
                          min="0"
                          defaultValue={activeCustomer?.remainingBalance || 0}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">الحالة القانونية الحالية</label>
                      <div key={activeCustomer?.id ?? 'new-customer'}>
                        <StatusOptionPicker
                          name="legalStatus"
                          defaultValue={activeCustomer?.legalStatus || 'none'}
                          options={statusOptions}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">المحامي المختص</label>
                      <select 
                        name="lawyerName" 
                        defaultValue={activeCustomer?.lawyerName}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                      >
                        <option value="">اختر محامياً...</option>
                        {lawyerNames.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">مبلغ آخر دفعة</label>
                    <input 
                      type="number"
                      name="lastInstallmentAmount" 
                      defaultValue={activeCustomer?.lastInstallmentAmount || 0}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">تاريخ آخر دفعة</label>
                    <input 
                      type="date"
                      name="lastInstallmentDate" 
                      defaultValue={activeCustomer?.lastInstallmentDate}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">ملاحظات وتقرير المتابعة</label>
                  <textarea 
                    name="lastContactNotes" 
                    defaultValue={activeCustomer?.lastContactNotes}
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 resize-none"
                    placeholder="تقرير التواصل الأخير..."
                  />
                </div>

                <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="submit"
                    disabled={formLoading}
                    className="bg-emerald-600 text-white px-10 py-3 rounded-xl text-sm font-bold hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/10 flex items-center gap-2 group active:scale-95 disabled:opacity-50"
                  >
                    <ButtonLoadingContent
                      loading={formLoading}
                      loadingText="جاري الحفظ..."
                      spinnerSize="sm"
                    >
                      <>
                        <CheckCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        حفظ الملف النهائي
                      </>
                    </ButtonLoadingContent>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto border border-slate-100"
              dir="rtl"
            >
              <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-400" />
                  إعدادات اللوحة والتحكم
                </h3>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 text-slate-400 hover:text-slate-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 custom-scrollbar">
                {canManageUsers(profile) && (
                  <section className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                    <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-widest mb-1">
                      {editingUser ? 'تعديل مستخدم' : 'إنشاء مستخدم جديد'}
                    </label>
                    <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                      يُحفظ الحساب فوراً. يمكن للمستخدم تسجيل الدخول بالبريد وكلمة المرور فقط (لا تسجيل ذاتي).
                    </p>
                    <form key={editingUserId ?? 'new'} onSubmit={handleSaveUser} className="space-y-3">
                      <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {!editingUser && (
                          <>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">البريد الإلكتروني</label>
                              <input
                                name="email"
                                type="email"
                                required
                                dir="ltr"
                                placeholder="user@example.com"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">كلمة المرور</label>
                              <PasswordInput name="password" required minLength={6} inputClassName="bg-white" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">تأكيد كلمة المرور</label>
                              <PasswordInput name="confirmPassword" required minLength={6} inputClassName="bg-white" />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">الاسم</label>
                          <input
                            name="displayName"
                            type="text"
                            defaultValue={editingUser?.displayName || editingUser?.lawyerName || ''}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                          />
                        </div>
                        <motion.div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">الصلاحية</label>
                          <select
                            name="role"
                            defaultValue={editingUser?.role ?? 'lawyer'}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                          >
                            <option value="admin">مسؤول (Admin)</option>
                            <option value="supervisor">مشرف (Supervisor)</option>
                            <option value="lawyer">محامي</option>
                          </select>
                        </motion.div>
                        <div className="sm:col-span-2 flex items-center gap-2">
                          <input
                            name="active"
                            type="checkbox"
                            defaultChecked={editingUser?.active ?? true}
                            className="rounded border-slate-300"
                          />
                          <label className="text-sm text-slate-700 font-medium">حساب نشط</label>
                        </div>
                      </motion.div>
                      {userFormError && (
                        <p className="text-xs text-rose-600 font-medium">{userFormError}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={userFormLoading}
                          className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-500 disabled:opacity-50"
                        >
                          <ButtonLoadingContent loading={userFormLoading} loadingText="جاري الحفظ...">
                            {editingUser ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
                          </ButtonLoadingContent>
                        </button>
                        {editingUser && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserId(null);
                              setUserFormError(null);
                            }}
                            className="border border-slate-200 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-bold"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    </form>

                    {visibleAppUsers.length > 0 && (
                      <div className="mt-6 space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">المستخدمون</p>
                        {visibleAppUsers.map((acc) => (
                          <div
                            key={acc.id}
                            className="bg-white rounded-xl border border-slate-200 text-sm overflow-hidden"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <motion.div className="font-bold text-slate-800 truncate" dir="ltr">
                                {acc.email}
                              </motion.div>
                              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                                <span>{acc.displayName || acc.lawyerName || '—'}</span>
                                <span>
                                  {acc.role === 'admin'
                                    ? 'مسؤول'
                                    : acc.role === 'supervisor'
                                      ? 'مشرف'
                                      : 'محامي'}
                                </span>
                                <span
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-bold',
                                    acc.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                  )}
                                >
                                  {acc.active ? 'نشط' : 'معطّل'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUserId(acc.id);
                                  setResettingPasswordUserId(null);
                                  setUserFormError(null);
                                  setPasswordResetError(null);
                                }}
                                className="text-xs text-slate-600 hover:underline font-bold"
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResettingPasswordUserId(
                                    resettingPasswordUserId === acc.id ? null : acc.id
                                  );
                                  setEditingUserId(null);
                                  setUserFormError(null);
                                  setPasswordResetError(null);
                                }}
                                className={cn(
                                  'text-xs hover:underline font-bold',
                                  resettingPasswordUserId === acc.id
                                    ? 'text-slate-600'
                                    : 'text-blue-600'
                                )}
                              >
                                {resettingPasswordUserId === acc.id ? 'إلغاء' : 'كلمة المرور'}
                              </button>
                              {!acc.active && (
                                <button
                                  type="button"
                                  onClick={() => handleActivateUser(acc.id)}
                                  className="text-xs text-emerald-600 hover:underline font-bold"
                                >
                                  تفعيل
                                </button>
                              )}
                              {acc.active && acc.id !== user?.uid && (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivateUser(acc.id)}
                                  className="text-xs text-rose-600 hover:underline font-bold"
                                >
                                  تعطيل
                                </button>
                              )}
                            </div>
                            </div>
                            {resettingPasswordUserId === acc.id && (
                              <form
                                onSubmit={(e) => handleSetUserPassword(e, acc.id)}
                                className="border-t border-slate-100 bg-slate-50/80 p-3 space-y-3"
                              >
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  تعيين كلمة مرور جديدة
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                      كلمة المرور الجديدة
                                    </label>
                                    <PasswordInput
                                      name="newPassword"
                                      required
                                      minLength={6}
                                      inputClassName="bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                      تأكيد كلمة المرور
                                    </label>
                                    <PasswordInput
                                      name="confirmNewPassword"
                                      required
                                      minLength={6}
                                      inputClassName="bg-white"
                                    />
                                  </div>
                                </div>
                                {passwordResetError && (
                                  <p className="text-xs text-rose-600 font-medium">{passwordResetError}</p>
                                )}
                                <button
                                  type="submit"
                                  disabled={passwordResetLoading}
                                  className="bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-blue-500 disabled:opacity-50"
                                >
                                  <ButtonLoadingContent loading={passwordResetLoading} loadingText="جاري الحفظ...">
                                    حفظ كلمة المرور
                                  </ButtonLoadingContent>
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {canManageSettings(profile) && (
                <section>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">إدارة حالات المتابعة</label>
                  <div className="space-y-4">
                    <div className="bg-slate-50/80 rounded-2xl border border-slate-100 p-4">
                      <p className="text-xs font-bold text-slate-600 mb-3">إضافة حالة جديدة</p>
                      <div className="flex gap-2">
                        <input
                          id="new-status"
                          type="text"
                          placeholder="اسم الحالة الجديدة..."
                          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddStatus(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                        <ColorPickerPopover
                          selected={newStatusColor}
                          onSelect={setNewStatusColor}
                          isOpen={colorPickerTarget === 'new'}
                          onClose={() => setColorPickerTarget(null)}
                        >
                          <button
                            type="button"
                            onClick={() => setColorPickerTarget(colorPickerTarget === 'new' ? null : 'new')}
                            className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:border-slate-300 transition-colors"
                            title="لون الحالة"
                            aria-label="لون الحالة"
                          >
                            <span
                              className={cn(
                                'w-5 h-5 rounded-full ring-2 ring-white shadow-sm',
                                getStatusColorClasses(newStatusColor, 'swatch')
                              )}
                            />
                          </button>
                        </ColorPickerPopover>
                        <button
                          onClick={() => {
                            const el = document.getElementById('new-status') as HTMLInputElement;
                            handleAddStatus(el.value);
                            el.value = '';
                          }}
                          className="shrink-0 bg-slate-900 text-white px-5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                        >
                          إضافة
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {statusOptions.map((opt) => {
                        const colorKey = getStatusColorKey(opt.value, statusOptions);
                        return (
                          <div
                            key={opt.value}
                            className="group flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all"
                          >
                            <ColorPickerPopover
                              selected={colorKey}
                              onSelect={(key) => handleUpdateStatusColor(opt.value, key)}
                              isOpen={colorPickerTarget === opt.value}
                              onClose={() => setColorPickerTarget(null)}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setColorPickerTarget(colorPickerTarget === opt.value ? null : opt.value)
                                }
                                className="w-8 h-8 shrink-0 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center hover:bg-slate-100 transition-colors"
                                title="تغيير اللون"
                                aria-label={`تغيير لون ${opt.label}`}
                              >
                                <span
                                  className={cn(
                                    'w-3.5 h-3.5 rounded-full',
                                    getStatusColorClasses(colorKey, 'swatch')
                                  )}
                                />
                              </button>
                            </ColorPickerPopover>
                            <StatusBadge status={opt.value} options={statusOptions} />
                            <div className="flex-1" />
                            <button
                              onClick={() => handleRemoveStatus(opt.value)}
                              className="p-2 rounded-lg text-slate-300 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-50 transition-all"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
                )}

                {admin && (
                <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">تعليمات استيراد الإكسل</label>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        يرجى التأكد من احتواء الملف على الأعمدة التالية:
                      </p>
                    </div>
                    <button 
                      onClick={handleDownloadTemplate}
                      className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-100 flex items-center gap-2 transition-all shadow-sm"
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                      تحميل القالب
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px]">
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">الاسم</span>
                      <span className="font-bold font-mono">Name</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">الهاتف</span>
                      <span className="font-bold font-mono">Phone</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">رقم الوحدة</span>
                      <span className="font-bold font-mono">Unit</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">عدد الأقساط المتأخرة</span>
                      <span className="font-bold font-mono">Delayed</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">المبلغ المتبقي</span>
                      <span className="font-bold font-mono">Balance</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">المحامي</span>
                      <span className="font-bold font-mono">Lawyer</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-400">الحالة</span>
                      <span className="font-bold font-mono">Status</span>
                    </div>
                  </div>
                </section>
                )}
              </div>

              <div className="p-8 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="bg-slate-900 text-white px-10 py-3 rounded-xl text-sm font-bold shadow-lg"
                >
                  إغلاق الإعدادات
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {selectedCustomer && (
        <CustomerPrintView
          customer={selectedCustomer}
          payments={visiblePayments}
          statusOptions={statusOptions}
          printedBy={displayNameForUser(user, profile)}
        />
      )}
    </div>
  );
}
