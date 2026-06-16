import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import type { Customer, Payment, StatusHistoryEntry } from '../lib/firebase';

interface StatusOption {
  value: string;
  label: string;
}

interface CustomerPrintViewProps {
  customer: Customer;
  payments: Payment[];
  statusOptions: StatusOption[];
  printedBy: string;
}

function toDate(value: string | Timestamp): Date {
  if (value instanceof Timestamp) return value.toDate();
  return new Date(value);
}

function statusLabel(status: string, options: StatusOption[]): string {
  return options.find((o) => o.value === status)?.label ?? status;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ color: '#64748b', fontWeight: 600, fontSize: '12px' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: '12px' }}>{value}</span>
    </div>
  );
}

function TimelineEntry({ entry, options }: { entry: StatusHistoryEntry; options: StatusOption[] }) {
  const date = toDate(entry.timestamp);
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
        <span>{format(date, 'yyyy/MM/dd HH:mm')}</span>
        <span style={{ fontWeight: 700 }}>{entry.updatedBy}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: '12px', color: '#1e293b' }}>{statusLabel(entry.status, options)}</div>
      {entry.notes && (
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>{entry.notes}</div>
      )}
    </div>
  );
}

export function CustomerPrintView({ customer, payments, statusOptions, printedBy }: CustomerPrintViewProps) {
  const history = customer.statusHistory?.slice().reverse() ?? [];
  const createdAt = customer.createdAt
    ? format(customer.createdAt.toDate(), 'yyyy/MM/dd')
    : '-';

  const content = (
    <div
      id="customer-print-root"
      className="hidden"
      dir="rtl"
      style={{ fontFamily: '"Tajawal", "Inter", system-ui, sans-serif', color: '#0f172a', padding: '24px', background: '#fff' }}
    >
      <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>ملف المتابعة القانونية</h1>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0', fontWeight: 700 }}>
          رقم الوحدة: {customer.unitNumber}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '10px', color: '#94a3b8' }}>
          <span>تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}</span>
          <span>طُبع بواسطة: {printedBy}</span>
        </div>
      </div>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          بيانات العميل
        </h2>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
          <InfoRow label="الاسم" value={customer.name} />
          <InfoRow label="رقم الهاتف" value={customer.phone} />
          <InfoRow label="رقم الوحدة" value={customer.unitNumber} />
          <InfoRow label="الحالة القانونية" value={statusLabel(customer.legalStatus, statusOptions)} />
          <InfoRow label="المبلغ المتبقي" value={`${customer.remainingBalance.toLocaleString()} د.ع`} />
          <InfoRow label="التلكؤ" value={`${customer.delayedInstallments} دفعات`} />
          <InfoRow label="المحامي المتابع" value={customer.lawyerName || 'لم يتم تحديد محامي'} />
          <InfoRow label="تاريخ الإضافة" value={createdAt} />
        </div>
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          ملاحظات التواصل الأخير
        </h2>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', lineHeight: 1.6 }}>
          {customer.lastContactNotes || 'لا توجد ملاحظات مسجلة لآخر تواصل'}
        </div>
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          آخر دفعة مسددة
        </h2>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
          <span>{(customer.lastInstallmentAmount || 0).toLocaleString()} د.ع</span>
          <span style={{ fontSize: '12px' }}>{customer.lastInstallmentDate || 'غير مسجل'}</span>
        </div>
      </section>

      <section style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          سجل الدفعات
        </h2>
        {payments.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>التاريخ</th>
                <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>المبلغ</th>
                <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>ملاحظات</th>
                <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>سجّل بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{p.paidAt}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{p.amount.toLocaleString()} د.ع</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{p.notes || '-'}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{p.recordedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '16px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
            لا توجد دفعات مسجلة
          </p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          السجل الزمني للتحديثات
        </h2>
        {history.length > 0 ? (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 16px' }}>
            {history.map((entry, idx) => (
              <div key={idx}>
                <TimelineEntry entry={entry} options={statusOptions} />
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '16px', border: '1px dashed #e2e8f0', borderRadius: '8px' }}>
            لا يوجد سجل تاريخي متوفر
          </p>
        )}
      </section>
    </div>
  );

  return createPortal(content, document.body);
}
