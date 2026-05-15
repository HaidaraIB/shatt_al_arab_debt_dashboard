import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Phone, 
  Home, 
  Scale, 
  FileText, 
  User as UserIcon, 
  Calendar, 
  DollarSign, 
  AlertCircle, 
  CheckCircle, 
  Gavel, 
  MoreHorizontal,
  X,
  LogOut,
  LogIn,
  Loader2,
  Trash2,
  Edit2,
  Settings,
  Bell,
  XCircle,
  Info,
  Upload,
  FileDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  auth, 
  db, 
  googleProvider, 
  Customer, 
  OperationType, 
  handleFirestoreError,
  arrayUnion,
  arrayRemove
} from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';

// --- Types & Constants ---

const LEGAL_STATUS_OPTIONS = [
  { value: 'none', label: 'لا توجد', icon: 'CheckCircle', color: 'text-emerald-500' },
  { value: 'notified', label: 'تم التبليغ', icon: 'AlertCircle', color: 'text-amber-500' },
  { value: 'warned', label: 'توجيه إنذار', icon: 'FileText', color: 'text-orange-500' },
  { value: 'lawsuit', label: 'رفع دعوى قضائية', icon: 'Gavel', color: 'text-rose-500' },
];

interface StatusOption {
  value: string;
  label: string;
  icon: string;
}

const ICON_MAP: Record<string, any> = {
  Plus, Search, Phone, Home, Scale, FileText, UserIcon, Calendar, 
  DollarSign, AlertCircle, CheckCircle, Gavel, MoreHorizontal, X, LogOut, 
  LogIn, Loader2, Trash2, Edit2, Settings, Bell, XCircle, Info, Upload, FileDown
};

// --- Components ---

const StatusBadge = ({ status, options }: { status: string, options: StatusOption[] }) => {
  const option = options.find(o => o.value === status) || { label: status, icon: 'Info' };
  const Icon = ICON_MAP[option.icon] || Info;
  
  const getStatusStyles = (val: string) => {
    switch(val) {
      case 'none': return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case 'notified': return "bg-amber-50 border-amber-200 text-amber-700";
      case 'warned': return "bg-orange-50 border-orange-200 text-orange-700";
      case 'lawsuit': return "bg-rose-50 border-rose-200 text-rose-700";
      default: return "bg-slate-50 border-slate-200 text-slate-700";
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", getStatusStyles(status))}>
      <Icon className="w-3.5 h-3.5" />
      <span>{option.label}</span>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lawyers, setLawyers] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(LEGAL_STATUS_OPTIONS);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null); // For the details aside
  const [formLoading, setFormLoading] = useState(false);
  const [statusUpdateVisible, setStatusUpdateVisible] = useState(false);
  const [paymentUpdateVisible, setPaymentUpdateVisible] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // --- Firebase Auth ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Real-time Data ---

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(data);
      // Update selected customer if it exists in the list
      if (selectedCustomer) {
        const updated = data.find(c => c.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    return unsubscribe;
  }, [user, selectedCustomer?.id]);

  useEffect(() => {
    if (!user) return;

    // Listen for lawyers
    const unsubLawyers = onSnapshot(doc(db, 'config', 'lawyers'), (snap) => {
      if (snap.exists()) {
        setLawyers(snap.data().list || []);
      }
    });

    // Listen for statuses
    const unsubStatuses = onSnapshot(doc(db, 'config', 'statuses'), (snap) => {
      if (snap.exists()) {
        setStatusOptions(snap.data().list || LEGAL_STATUS_OPTIONS);
      }
    });

    return () => {
      unsubLawyers();
      unsubStatuses();
    };
  }, [user]);

  // --- Actions ---

  const handleSaveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const data: Partial<Customer> = {
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      unitNumber: formData.get('unitNumber') as string,
      delayedInstallments: Number(formData.get('delayedInstallments')),
      remainingBalance: Number(formData.get('remainingBalance')),
      lastInstallmentDate: formData.get('lastInstallmentDate') as string,
      lastInstallmentAmount: Number(formData.get('lastInstallmentAmount')),
      legalStatus: formData.get('legalStatus') as any,
      lawyerName: formData.get('lawyerName') as string,
      lastContactNotes: formData.get('lastContactNotes') as string,
      updatedAt: serverTimestamp() as any,
    };

    try {
      if (activeCustomer?.id) {
        // Check if legalStatus changed
        if (activeCustomer.legalStatus !== (data.legalStatus as any)) {
          data.statusHistory = arrayUnion({
            status: data.legalStatus,
            notes: `تغيير الحالة من النموذج الرئيسي: ${data.lastContactNotes || 'بدون ملاحظات'}`,
            updatedBy: user?.displayName || 'System',
            timestamp: new Date().toISOString(),
          }) as any;
        }
        await updateDoc(doc(db, 'customers', activeCustomer.id), data);
      } else {
        data.createdAt = serverTimestamp() as any;
        data.statusHistory = [{
          status: data.legalStatus as any,
          notes: 'إضافة الزبون للنظام لأول مرة',
          updatedBy: user?.displayName || 'System',
          timestamp: new Date().toISOString(),
        }];
        await addDoc(collection(db, 'customers'), data);
      }
      setIsModalOpen(false);
      setActiveCustomer(null);
    } catch (error) {
      handleFirestoreError(error, activeCustomer ? OperationType.UPDATE : OperationType.CREATE, 'customers');
    } finally {
      setFormLoading(false);
    }
  };

  const handlePaymentUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const date = formData.get('date') as string;
    const notes = formData.get('notes') as string;

    try {
      const newRemainingBalance = Math.max(0, selectedCustomer.remainingBalance - amount);
      const newDelayedInstallments = Math.max(0, selectedCustomer.delayedInstallments - 1);

      await updateDoc(doc(db, 'customers', selectedCustomer.id), {
        remainingBalance: newRemainingBalance,
        delayedInstallments: newDelayedInstallments,
        lastInstallmentAmount: amount,
        lastInstallmentDate: date,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'none', // Payment is a positive activity, maybe keep current status or reset? Let's keep current.
          notes: `تم استلام دفعة مالية بقيمة ${amount.toLocaleString()} د.ع بتاريخ ${date}. ${notes}`,
          updatedBy: user?.displayName || 'System',
          timestamp: new Date().toISOString(),
        })
      });
      setPaymentUpdateVisible(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customers/${selectedCustomer.id}`);
    } finally {
      setFormLoading(false);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImportLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        let importedCount = 0;
        for (const row of data) {
          // Map excel columns to database fields
          // Expected columns: Name, Phone, Unit, Delayed, Balance, Lawyer, Status
          const customer: Partial<Customer> = {
            name: String(row.Name || row['الاسم'] || ''),
            phone: String(row.Phone || row['الهاتف'] || ''),
            unitNumber: String(row.Unit || row['الوحدة'] || ''),
            delayedInstallments: Number(row.Delayed || row['التأخير'] || 0),
            remainingBalance: Number(row.Balance || row['المبلغ'] || 0),
            lawyerName: String(row.Lawyer || row['المحامي'] || ''),
            legalStatus: row.Status || row['الحالة'] || 'none',
            lastContactNotes: 'مستورد من ملف إكسل',
            createdAt: serverTimestamp() as any,
            updatedAt: serverTimestamp() as any,
            statusHistory: [{
              status: (row.Status || 'none') as any,
              notes: 'تمت الإضافة عبر استيراد إكسل',
              updatedBy: user.displayName || 'System',
              timestamp: new Date().toISOString(),
            }]
          };

          if (customer.name && customer.unitNumber) {
            await addDoc(collection(db, 'customers'), customer);
            importedCount++;
          }
        }
        alert(`تم استيراد ${importedCount} زبون بنجاح`);
      } catch (error) {
        console.error("Import error:", error);
        alert("فشل استيراد الملف. تأكد من صحة البيانات.");
      } finally {
        setImportLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "الاسم": "أحمد علي",
        "الهاتف": "07800000000",
        "الوحدة": "Z1-101",
        "التأخير": 3,
        "المبلغ": 15000000,
        "المحامي": "مخلص الوائلي",
        "الحالة": "warned"
      },
      {
        "الاسم": "سارة محمد",
        "الهاتف": "07700000000",
        "الوحدة": "Z1-502",
        "التأخير": 1,
        "المبلغ": 5000000,
        "المحامي": "",
        "الحالة": "notified"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers Template");
    XLSX.writeFile(wb, "Shatt_AlArab_Template.xlsx");
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف معلومات هذا الزبون؟")) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
    }
  };

  const handleQuickStatusUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    setFormLoading(true);

    const formData = new FormData(e.currentTarget);
    const newStatus = formData.get('legalStatus') as any;
    const notes = formData.get('notes') as string;

    try {
      await updateDoc(doc(db, 'customers', selectedCustomer.id), {
        legalStatus: newStatus,
        lastContactNotes: notes,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: newStatus,
          notes: notes || 'تحديث حالة سريع',
          updatedBy: user?.displayName || 'System',
          timestamp: new Date().toISOString(),
        })
      });
      setStatusUpdateVisible(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customers/${selectedCustomer.id}`);
    } finally {
      setFormLoading(false);
    }
  };

  // --- Settings Actions ---

  const handleAddLawyer = async (name: string) => {
    if (!name || lawyers.includes(name)) return;
    try {
      await updateDoc(doc(db, 'config', 'lawyers'), {
        list: arrayUnion(name)
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemoveLawyer = async (name: string) => {
    try {
      await updateDoc(doc(db, 'config', 'lawyers'), {
        list: arrayRemove(name)
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddStatus = async (label: string) => {
    if (!label) return;
    const value = label.trim().toLowerCase().replace(/\s+/g, '_');
    if (statusOptions.find(o => o.value === value)) return;
    
    const newStatus: StatusOption = {
      value,
      label,
      icon: 'Bell'
    };
    
    try {
      await updateDoc(doc(db, 'config', 'statuses'), {
        list: arrayUnion(newStatus)
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemoveStatus = async (value: string) => {
    const statusToRemove = statusOptions.find(o => o.value === value);
    if (!statusToRemove) return;
    try {
      await updateDoc(doc(db, 'config', 'statuses'), {
        list: arrayRemove(statusToRemove)
      });
    } catch (error) {
      console.error(error);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.unitNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  // --- Render Helpers ---

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6 text-right" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Scale className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">إدارة ديون الزون الأول</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            مرحباً بك في نظام إدارة الزبائن المتأخرين بمدينة شط العرب السكنية. يرجى تسجيل الدخول للمتابعة.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-3 px-4 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors font-medium shadow-sm"
          >
            <LogIn className="w-5 h-5 text-slate-400" />
            تسجيل الدخول باستخدام جوجل
          </button>
        </div>
      </div>
    );
  }

  const totalBalance = customers.reduce((sum, c) => sum + c.remainingBalance, 0);

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
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="hidden md:inline">استيراد</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
              title="الإعدادات"
            >
              <Settings className="w-5 h-5" />
              <span className="hidden md:inline text-xs font-bold uppercase tracking-widest">الإعدادات</span>
            </button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Sub-Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white border-b border-slate-200 shrink-0">
        <div className="bg-slate-50 p-3 rounded border border-slate-200">
          <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">عدد المتلكأين</div>
          <div className="text-2xl font-bold font-mono">{customers.length} <span className="text-xs font-sans text-slate-400">زبون</span></div>
        </div>
        <div className="bg-amber-50 p-3 rounded border border-amber-200">
          <div className="text-amber-700 text-[10px] uppercase tracking-widest font-bold mb-1">توجيه إنذار</div>
          <div className="text-2xl font-bold text-amber-700 font-mono">{customers.filter(c => c.legalStatus === 'warned').length}</div>
        </div>
        <div className="bg-red-50 p-3 rounded border border-red-200">
          <div className="text-red-700 text-[10px] uppercase tracking-widest font-bold mb-1">دعاوى فسخ عقد</div>
          <div className="text-2xl font-bold text-red-700 font-mono">{customers.filter(c => c.legalStatus === 'lawsuit').length}</div>
        </div>
        <div className="bg-blue-50 p-3 rounded border border-blue-200">
          <div className="text-blue-700 text-[10px] uppercase tracking-widest font-bold mb-1">متابعات المحامين</div>
          <div className="text-2xl font-bold text-blue-700 font-mono">
            {new Set(customers.map(c => c.lawyerName).filter(Boolean)).size} <span className="text-xs font-sans">محامين</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Data Grid Container */}
        <section className="flex-1 border-l border-slate-200 flex flex-col bg-white overflow-hidden">
          <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">جدول المتابعة اليومية</span>
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
                  <th className="p-3 text-slate-500 font-bold text-xs">الحالة القانونية</th>
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
                      selectedCustomer?.id === c.id ? "bg-emerald-50/30 border-emerald-500" : 
                      c.legalStatus === 'lawsuit' ? "border-red-500" :
                      c.legalStatus === 'warned' ? "border-amber-500" :
                      "border-slate-200"
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
                    <td className="p-3">
                      <StatusBadge status={c.legalStatus} options={statusOptions} />
                    </td>
                    <td className="p-3 text-left">
                      <button className="text-emerald-600 hover:underline text-xs font-bold">التفاصيل</button>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 italic">لا توجد بيانات مطابقة لهذا البحث</td>
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
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div>
                  <h2 className="font-bold text-lg text-slate-900 leading-tight">{selectedCustomer.name}</h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">ملف المتابعة القانونية | {selectedCustomer.unitNumber}</p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-slate-300 hover:text-slate-900">
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
                       <button 
                        onClick={() => {
                          setPaymentUpdateVisible(!paymentUpdateVisible);
                          setStatusUpdateVisible(false);
                        }}
                        className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded-md font-bold hover:bg-emerald-500 transition-colors"
                      >
                        {paymentUpdateVisible ? 'إلغاء' : 'إضافة دفعة'}
                      </button>
                      <button 
                        onClick={() => {
                          setStatusUpdateVisible(!statusUpdateVisible);
                          setPaymentUpdateVisible(false);
                        }}
                        className="text-[10px] bg-slate-900 text-white px-2 py-1 rounded-md font-bold hover:bg-slate-800 transition-colors"
                      >
                        {statusUpdateVisible ? 'إلغاء' : 'تحديث الحالة'}
                      </button>
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
                        {formLoading ? 'جاري الحفظ...' : 'تثبيت الدفعة'}
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
                      <select 
                        name="legalStatus" 
                        defaultValue={selectedCustomer.legalStatus}
                        className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                      >
                        {statusOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
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
                        {formLoading ? 'جاري الحفظ...' : 'تثبيت التحديث'}
                      </button>
                    </motion.form>
                  )}

                  <div className="space-y-4">
                    {selectedCustomer.statusHistory && selectedCustomer.statusHistory.length > 0 ? (
                      selectedCustomer.statusHistory.slice().reverse().map((entry, idx) => {
                        const statusOpt = statusOptions.find(o => o.value === entry.status);
                        const StatusIcon = ICON_MAP[statusOpt?.icon || 'Info'] || Info;
                        const date = new Date(entry.timestamp);
                        
                        return (
                          <div key={idx} className="relative pr-6 before:absolute before:right-2 before:top-2 before:bottom-0 before:w-px before:bg-slate-100 last:before:hidden">
                            <div className={cn("absolute right-0 top-1 w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center", 
                              entry.status === 'lawsuit' ? "border-rose-500" :
                              entry.status === 'warned' ? "border-amber-500" :
                              entry.status === 'notified' ? "border-blue-500" :
                              "border-emerald-500"
                            )}>
                              {(() => {
                                const opt = statusOptions.find(o => o.value === entry.status);
                                const Icon = ICON_MAP[opt?.icon || 'Info'] || Info;
                                return <Icon className={cn("w-2 h-2", 
                                  entry.status === 'lawsuit' ? "text-rose-500" :
                                  entry.status === 'warned' ? "text-amber-500" :
                                  entry.status === 'notified' ? "text-blue-500" :
                                  "text-emerald-500"
                                )} />;
                              })()}
                            </div>
                            <div className="flex justify-between items-start mb-1 text-[10px] font-mono text-slate-400">
                              <span>{format(date, 'yyyy/MM/dd HH:mm')}</span>
                              <span className="font-sans font-bold">{entry.updatedBy}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-700">{statusOptions.find(o => o.value === entry.status)?.label || entry.status}</p>
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
                <button 
                  className="border border-slate-200 text-slate-600 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  onClick={() => window.print()}
                >
                  <FileText className="w-3.5 h-3.5" />
                  طباعة
                </button>
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
          <span>المستخدم: {user.displayName}</span>
          <span>{format(new Date(), 'HH:mm')} ص</span>
        </div>
      </footer>

      {/* Modal / Form - Keep as is but styling tweak */}
      <AnimatePresence>
        {isModalOpen && (
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
                      <select 
                        name="legalStatus" 
                        required 
                        defaultValue={activeCustomer?.legalStatus || 'none'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                      >
                        {statusOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">المحامي المختص</label>
                      <select 
                        name="lawyerName" 
                        defaultValue={activeCustomer?.lawyerName}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                      >
                        <option value="">اختر محامياً...</option>
                        {lawyers.map(l => (
                          <option key={l} value={l}>{l}</option>
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
                    {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    حفظ الملف النهائي
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
                {/* Lawyers Config */}
                <section>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">إدارة المحامين</label>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input 
                        id="new-lawyer"
                        type="text" 
                        placeholder="اسم المحامي الجديد..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddLawyer(e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <button 
                        onClick={() => {
                          const el = document.getElementById('new-lawyer') as HTMLInputElement;
                          handleAddLawyer(el.value);
                          el.value = '';
                        }}
                        className="bg-slate-900 text-white px-4 rounded-xl text-xs font-bold hover:bg-slate-800"
                      >
                        إضافة
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lawyers.map(l => (
                        <div key={l} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium">
                          <span>{l}</span>
                          <button onClick={() => handleRemoveLawyer(l)} className="text-slate-400 hover:text-rose-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {lawyers.length === 0 && <p className="text-xs text-slate-400 italic">لا يوجد محامون مضافون حالياً</p>}
                    </div>
                  </div>
                </section>

                {/* Statuses Config */}
                <section>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">إدارة حالات المتابعة</label>
                  <div className="space-y-4">
                     <div className="flex gap-2">
                      <input 
                        id="new-status"
                        type="text" 
                        placeholder="اسم الحالة الجديدة..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddStatus(e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <button 
                         onClick={() => {
                          const el = document.getElementById('new-status') as HTMLInputElement;
                          handleAddStatus(el.value);
                          el.value = '';
                        }}
                        className="bg-slate-900 text-white px-4 rounded-xl text-xs font-bold hover:bg-slate-800"
                      >
                        إضافة
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {statusOptions.map(opt => (
                        <div key={opt.value} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const StatusIcon = ICON_MAP[opt.icon] || Info;
                              return <StatusIcon className="w-4 h-4 text-slate-400" />;
                            })()}
                            <span className="text-sm font-bold text-slate-700">{opt.label}</span>
                          </div>
                          <button 
                            onClick={() => handleRemoveStatus(opt.value)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
                {/* Import Guide */}
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
    </div>
  );
}
