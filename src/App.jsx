import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { resolveDoctorPhotoUrl } from "./utils/resolveDoctorPhotoUrl.js";

const RAW_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const API_URL = `${RAW_API_URL.replace(/\/$/, "")}/admin`;
const PUBLIC_API_URL = RAW_API_URL.replace(/\/$/, "");
const REG_FALLBACK_GROUP_MS = 5 * 60 * 1000;

const queueLabel = (ticket, section) => {
  if (!ticket) return "—";
  const sec = String(section || ticket.section || "").toUpperCase();
  const n = String(ticket.departmentNumber ?? "").padStart(3, "0");
  return sec ? `${sec}-${n}` : n;
};

const emptyService = {
  id: "",
  name: "",
  section: "",
  roomNumber: "",
  price: 0,
  doctorFirstName: "",
  doctorLastName: "",
  doctorPhotoUrl: ""
};

const emptyDepartment = {
  section: "",
  title: "",
  doctorFirstName: "",
  doctorLastName: "",
  doctorLogin: "",
  doctorPassword: "",
  doctorPhotoUrl: ""
};

const emptyRegistrationDraft = {
  name: "",
  login: "",
  password: "",
  enabled: true
};

const emptyRegistrationDepartmentDraft = {
  section: "",
  title: ""
};

const slugServiceId = (section) => {
  const s = String(section || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return s || "xizmat";
};

const uniqueAmongServices = (baseId, serviceList, excludeIndex) => {
  let id = baseId;
  let n = 0;
  while (
    serviceList.some(
      (s, i) => i !== excludeIndex && String(s.id || "").toLowerCase() === String(id).toLowerCase()
    )
  ) {
    n += 1;
    id = `${baseId}${n}`;
  }
  return id;
};

const mergeDoctorFromDepartment = (row, dept) => {
  if (!dept) return { ...row };
  const hadId = Boolean(String(row.id || "").trim());
  const nextName = dept.title?.trim() ? dept.title : `Navbat ${dept.section}`;
  return {
    ...row,
    section: dept.section,
    name: nextName,
    id: hadId ? row.id : slugServiceId(dept.section),
    doctorFirstName: dept.doctorFirstName,
    doctorLastName: dept.doctorLastName,
    doctorPhotoUrl: dept.doctorPhotoUrl
  };
};

const fieldClass =
  "w-full min-h-[52px] rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3.5 text-[15px] leading-snug text-white placeholder:text-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-teal-400/55 focus:ring-2 focus:ring-teal-500/25";

const fieldLabel = "mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50";

const formatPriceDisplay = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "";
  return num.toLocaleString("uz-UZ", { maximumFractionDigits: 0 });
};

const formatReportDateTime = (iso, timeZone) => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("uz-UZ", {
      timeZone: timeZone || "Asia/Tashkent",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
};
const getTodayIsoDate = () => {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
};

const formatDoctorFromRow = (row) => {
  const full = [row?.doctorFirstName, row?.doctorLastName].filter(Boolean).join(" ").trim();
  return full || "—";
};

const buildTicketFromOrderRow = (row) => ({
  id: row.ticketId,
  createdAt: row.createdAt,
  departmentNumber: row.departmentNumber,
  serviceId: row.serviceId,
  service: row.service,
  section: row.section,
  price: row.price,
  roomNumber: row.roomNumber || "",
  doctorFirstName: row.doctorFirstName || "",
  doctorLastName: row.doctorLastName || "",
  doctorPhone: row.doctorPhone || "",
  patientFirstName: row.patientFirstName || "",
  patientLastName: row.patientLastName || "",
  patientPhone: row.patientPhone || ""
});
const getRegistrationBatchOrFallbackKey = (row, ticketId) => {
  const explicitBatchId = String(row?.registrationBatchId || row?.batchId || "")
    .trim()
    .toLowerCase();
  if (explicitBatchId) return `batch:${explicitBatchId}`;

  const phone = String(row?.patientPhone || "").replace(/\D/g, "");
  const first = String(row?.patientFirstName || "").trim().toLowerCase();
  const last = String(row?.patientLastName || "").trim().toLowerCase();
  const section = String(row?.section || "").trim().toLowerCase();
  const createdTs = new Date(row?.createdAt || "").getTime();
  if (Number.isFinite(createdTs)) {
    const bucket = Math.floor(createdTs / REG_FALLBACK_GROUP_MS);
    return `fb:${phone || `${first}|${last}`}:${section}:${bucket}`;
  }
  return `ticket:${ticketId}`;
};
const getCashierReportDepartmentLabel = (row) =>
  String(row?.departmentTitle || row?.departmentSection || row?.section || "Noma'lum bo'lim").trim();
const formatPaymentMethodLabel = (value) => {
  const method = String(value || "")
    .trim()
    .toLowerCase();
  if (method === "card") return "Karta";
  return "Naqd pul";
};

const parsePriceDigits = (str) => {
  const d = String(str).replace(/\D/g, "");
  if (d === "") return 0;
  const v = Number(d);
  return Number.isFinite(v) ? v : 0;
};

const uploadDoctorPhotoFile = async (file) => {
  const formData = new FormData();
  formData.append("photo", file);
  const response = await fetch(`${API_URL}/upload/doctor-photo`, {
    method: "POST",
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Rasm yuklashda xatolik");
  }
  if (!data.doctorPhotoUrl) {
    throw new Error("Server javobida rasm yo‘li yo‘q");
  }
  return data.doctorPhotoUrl;
};

const PAGES = {
  services: "services",
  departments: "departments",
  registration: "registration",
  registrationDepartments: "registrationDepartments",
  registrationServices: "registrationServices",
  registrationOrders: "registrationOrders",
  cashier: "cashier",
  cashierOrders: "cashierOrders",
  cashierReports: "cashierReports",
  printer: "printer",
  reports: "reports",
  orders: "orders",
  settings: "settings",
  control: "control"
};

/** Sidebar: stroke ikonalar, currentColor */
const NavIcon = ({ children, className = "h-5 w-5 shrink-0 opacity-90" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

const IconControl = () => (
  <NavIcon>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </NavIcon>
);
const IconOrders = () => (
  <NavIcon>
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
    <path d="M9 12h6M9 16h6" />
  </NavIcon>
);
const IconReports = () => (
  <NavIcon>
    <path d="M3 3v18h18" />
    <path d="M7 16l4-4 4 4 5-7" />
  </NavIcon>
);
const IconRegistration = () => (
  <NavIcon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 9h6M7 13h4M15 12h2M17 12v2" />
  </NavIcon>
);
const IconRegistrationDepartments = () => (
  <NavIcon>
    <path d="M4 20V8l8-4 8 4v12" />
    <path d="M9 20v-6h6v6" />
  </NavIcon>
);
const IconRegistrationOrders = () => (
  <NavIcon>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9h8M8 13h5M15 13h1M8 17h8" />
  </NavIcon>
);
const IconDepartments = () => (
  <NavIcon>
    <path d="M3 21h18" />
    <path d="M6 21V8h4V21M14 21V4h4v17" />
  </NavIcon>
);
const IconServices = () => (
  <NavIcon>
    <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    <path d="M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" />
    <path d="M12 12v3" />
  </NavIcon>
);
const IconSettings = () => (
  <NavIcon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </NavIcon>
);

const TapButton = ({ children, ...props }) => (
  <motion.button whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 500, damping: 24 }} {...props}>
    {children}
  </motion.button>
);

export default function App() {
  const [activePage, setActivePage] = useState(PAGES.control);
  const [isKorikMenuOpen, setIsKorikMenuOpen] = useState(false);
  const [isRegistrationMenuOpen, setIsRegistrationMenuOpen] = useState(false);
  const [isCashierMenuOpen, setIsCashierMenuOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newService, setNewService] = useState(emptyService);
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [newDepartment, setNewDepartment] = useState(emptyDepartment);
  const [queueSnapshot, setQueueSnapshot] = useState(null);
  const [printerTarget, setPrinterTarget] = useState("");
  const [printerPort, setPrinterPort] = useState(9100);
  const [cashierPrinterTarget, setCashierPrinterTarget] = useState("");
  const [cashierPrinterPort, setCashierPrinterPort] = useState(9100);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinterUri, setSelectedPrinterUri] = useState("");
  const [message, setMessage] = useState("");
  const [reportFromDate, setReportFromDate] = useState(() => getTodayIsoDate());
  const [reportToDate, setReportToDate] = useState(() => getTodayIsoDate());
  const [reportData, setReportData] = useState(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [ordersLogData, setOrdersLogData] = useState(null);
  const [isOrdersLogLoading, setIsOrdersLogLoading] = useState(false);
  const [ordersLogLimit, setOrdersLogLimit] = useState(12000);
  const [registrationOrdersData, setRegistrationOrdersData] = useState(null);
  const [isRegistrationOrdersLoading, setIsRegistrationOrdersLoading] = useState(false);
  const [registrationOrdersLimit, setRegistrationOrdersLimit] = useState(12000);
  const [cashierReportsData, setCashierReportsData] = useState(null);
  const [isCashierReportsLoading, setIsCashierReportsLoading] = useState(false);
  const [cashierReportsLimit, setCashierReportsLimit] = useState(20000);
  const [cashierPendingRows, setCashierPendingRows] = useState([]);
  const [isCashierPendingLoading, setIsCashierPendingLoading] = useState(false);
  const [cashierAllOrdersData, setCashierAllOrdersData] = useState(null);
  const [isCashierAllOrdersLoading, setIsCashierAllOrdersLoading] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [pendingCancelReason, setPendingCancelReason] = useState("");
  const [cashierActorId, setCashierActorId] = useState("");
  const [cashierReportExactDate, setCashierReportExactDate] = useState("");
  const [cashierReportFromDate, setCashierReportFromDate] = useState("");
  const [cashierReportToDate, setCashierReportToDate] = useState("");
  const [cashierReportSection, setCashierReportSection] = useState("");
  const [cashierReportPatientQuery, setCashierReportPatientQuery] = useState("");
  const [cashierAppliedExactDate, setCashierAppliedExactDate] = useState("");
  const [cashierAppliedFromDate, setCashierAppliedFromDate] = useState("");
  const [cashierAppliedToDate, setCashierAppliedToDate] = useState("");
  const [cashierAppliedSection, setCashierAppliedSection] = useState("");
  const [cashierAppliedPatientQuery, setCashierAppliedPatientQuery] = useState("");
  const [cashierFilterApplied, setCashierFilterApplied] = useState(false);
  const [cashierTrendExactDate, setCashierTrendExactDate] = useState("");
  const [cashierTrendFromDate, setCashierTrendFromDate] = useState("");
  const [cashierTrendToDate, setCashierTrendToDate] = useState("");
  const [isRegistrationPatientsModalOpen, setIsRegistrationPatientsModalOpen] = useState(false);
  const [registrationPatientsData, setRegistrationPatientsData] = useState(null);
  const [isRegistrationPatientsLoading, setIsRegistrationPatientsLoading] = useState(false);
  const [registrationPatientsLimit] = useState(20000);
  const [registrationPatientsQuery, setRegistrationPatientsQuery] = useState("");
  const [expandedRegistrationPatients, setExpandedRegistrationPatients] = useState({});
  const [printingRegistrationPatientKey, setPrintingRegistrationPatientKey] = useState(null);
  const [printingOrderTicketId, setPrintingOrderTicketId] = useState(null);
  const [cashiers, setCashiers] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [registrationDepartments, setRegistrationDepartments] = useState([]);
  const [newRegistrationDepartmentDraft, setNewRegistrationDepartmentDraft] = useState(emptyRegistrationDepartmentDraft);
  const [registrationServices, setRegistrationServices] = useState([]);
  const [isRegistrationServiceModalOpen, setIsRegistrationServiceModalOpen] = useState(false);
  const [newRegistrationService, setNewRegistrationService] = useState({ section: "", name: "", doctorName: "", price: 0 });
  const [isAddRegistrationModalOpen, setIsAddRegistrationModalOpen] = useState(false);
  const [newRegistrationDraft, setNewRegistrationDraft] = useState(emptyRegistrationDraft);
  const [isLoadingDevicePrinters, setIsLoadingDevicePrinters] = useState(false);
  const isHydratingRef = useRef(true);
  const lastSavedRegistrationsRef = useRef("");
  const lastSavedRegistrationServicesRef = useRef("");
  const lastSavedRegistrationDepartmentsRef = useRef("");
  const registrationsDirtyRef = useRef(false);
  const registrationDepartmentsDirtyRef = useRef(false);

  const isZbPrinter = (value) => String(value || "").toLowerCase().includes("zb");
  const cashierNameById = useMemo(() => {
    const map = new Map();
    (cashiers || []).forEach((c) => {
      const id = String(c?.id || "").trim();
      if (!id) return;
      map.set(id, String(c?.name || c?.login || id).trim());
    });
    return map;
  }, [cashiers]);
  const cashierDepartmentLookup = useMemo(() => {
    const regularDeptBySection = new Map(
      (departments || []).map((d) => [String(d?.section || "").trim().toUpperCase(), String(d?.title || "").trim()])
    );
    const registrationDeptBySection = new Map(
      (registrationDepartments || []).map((d) => [
        String(d?.section || "").trim().toUpperCase(),
        String(d?.title || "").trim()
      ])
    );
    const byServiceId = new Map();

    (services || []).forEach((svc) => {
      const id = String(svc?.id || "").trim();
      if (!id) return;
      const section = String(svc?.section || "").trim().toUpperCase();
      const label = regularDeptBySection.get(section) || String(svc?.name || "").trim() || section;
      if (label) byServiceId.set(id, label);
    });

    (registrationServices || []).forEach((svc) => {
      const id = String(svc?.id || "").trim();
      if (!id) return;
      const section = String(svc?.section || "").trim().toUpperCase();
      const label = registrationDeptBySection.get(section) || String(svc?.name || "").trim() || section;
      if (label) byServiceId.set(id, label);
    });

    return { byServiceId, regularDeptBySection, registrationDeptBySection };
  }, [services, departments, registrationServices, registrationDepartments]);
  const getCashierReportDepartmentLabel = useCallback(
    (row) => {
      const serviceId = String(row?.serviceId || "").trim();
      if (serviceId && cashierDepartmentLookup.byServiceId.has(serviceId)) {
        return cashierDepartmentLookup.byServiceId.get(serviceId);
      }

      const departmentSection = String(row?.departmentSection || "").trim().toUpperCase();
      if (departmentSection && cashierDepartmentLookup.registrationDeptBySection.has(departmentSection)) {
        return cashierDepartmentLookup.registrationDeptBySection.get(departmentSection);
      }

      const section = String(row?.section || "").trim().toUpperCase();
      if (section && cashierDepartmentLookup.regularDeptBySection.has(section)) {
        return cashierDepartmentLookup.regularDeptBySection.get(section);
      }
      if (section && cashierDepartmentLookup.registrationDeptBySection.has(section)) {
        return cashierDepartmentLookup.registrationDeptBySection.get(section);
      }

      const rawTitle = String(row?.departmentTitle || "").trim();
      if (rawTitle) return rawTitle;
      return String(row?.departmentSection || row?.section || "Noma'lum bo'lim").trim();
    },
    [cashierDepartmentLookup]
  );

  const fetchConfig = async () => {
    const response = await fetch(`${API_URL}/config`, { cache: "no-store" });
    const data = await response.json();
    setServices(data.services || []);
    setDepartments(data.departments || []);
    setCashiers(data.cashiers || []);
    if (!registrationsDirtyRef.current) {
      setRegistrations(data.registrations || []);
      lastSavedRegistrationsRef.current = JSON.stringify(data.registrations || []);
    }
    if (!registrationDepartmentsDirtyRef.current) {
      setRegistrationDepartments(data.registrationDepartments || []);
      lastSavedRegistrationDepartmentsRef.current = JSON.stringify(data.registrationDepartments || []);
    }
    setRegistrationServices(data.registrationServices || []);
    setPrinterTarget(data.printerTarget || "");
    setPrinterPort(data.printerPort || 9100);
    setCashierPrinterTarget(data.cashierPrinterTarget || "");
    setCashierPrinterPort(Number(data.cashierPrinterPort) || 9100);
    lastSavedRegistrationServicesRef.current = JSON.stringify(data.registrationServices || []);
    isHydratingRef.current = false;
  };

  useEffect(() => {
    fetchConfig();
  }, []);
  useEffect(() => {
    if (cashierActorId) return;
    const firstEnabled = (cashiers || []).find((c) => c.enabled !== false && String(c.id || "").trim());
    if (firstEnabled?.id) setCashierActorId(String(firstEnabled.id));
  }, [cashiers, cashierActorId]);

  const fetchOrdersLog = useCallback(async () => {
    setIsOrdersLogLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/orders-log?limit=${encodeURIComponent(ordersLogLimit)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || "Buyurtmalar ro'yxatini olishda xatolik");
        return;
      }
      setOrdersLogData(data);
    } catch (_error) {
      window.alert("Buyurtmalar: server bilan aloqa xatoligi");
    } finally {
      setIsOrdersLogLoading(false);
    }
  }, [ordersLogLimit]);

  const fetchOrdersLogRef = useRef(fetchOrdersLog);
  fetchOrdersLogRef.current = fetchOrdersLog;

  const fetchRegistrationOrdersLog = useCallback(async () => {
    setIsRegistrationOrdersLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/registration-orders-log?status=all&limit=${encodeURIComponent(registrationOrdersLimit)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || "Registratsiya buyurtmalarini olishda xatolik");
        return;
      }
      setRegistrationOrdersData(data);
    } catch (_error) {
      window.alert("Registratsiya buyurtmalari: server bilan aloqa xatoligi");
    } finally {
      setIsRegistrationOrdersLoading(false);
    }
  }, [registrationOrdersLimit]);

  const fetchRegistrationOrdersLogRef = useRef(fetchRegistrationOrdersLog);
  fetchRegistrationOrdersLogRef.current = fetchRegistrationOrdersLog;
  const fetchCashierReportsLog = useCallback(async () => {
    setIsCashierReportsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/registration-orders-log?status=confirmed&limit=${encodeURIComponent(cashierReportsLimit)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || "Kassa hisobotini olishda xatolik");
        return;
      }
      setCashierReportsData(data);
    } catch (_error) {
      window.alert("Kassa hisobotlari: server bilan aloqa xatoligi");
    } finally {
      setIsCashierReportsLoading(false);
    }
  }, [cashierReportsLimit]);
  const fetchCashierReportsLogRef = useRef(fetchCashierReportsLog);
  fetchCashierReportsLogRef.current = fetchCashierReportsLog;
  const fetchCashierPendingOrders = useCallback(async () => {
    setIsCashierPendingLoading(true);
    try {
      const response = await fetch(`${PUBLIC_API_URL}/cashier/pending-orders?limit=1000`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Kassa buyurtmalarini olishda xatolik");
        return;
      }
      setCashierPendingRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (_error) {
      window.alert("Kassa buyurtmalari: server bilan aloqa xatoligi");
    } finally {
      setIsCashierPendingLoading(false);
    }
  }, []);
  const fetchCashierPendingOrdersRef = useRef(fetchCashierPendingOrders);
  fetchCashierPendingOrdersRef.current = fetchCashierPendingOrders;
  const fetchCashierAllOrders = useCallback(async () => {
    setIsCashierAllOrdersLoading(true);
    try {
      const response = await fetch(`${PUBLIC_API_URL}/cashier/orders-log?status=all&limit=500`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Kassa buyurtmalari tarixini olishda xatolik");
        return;
      }
      setCashierAllOrdersData(data);
    } catch (_error) {
      window.alert("Kassa buyurtmalari tarixi: server bilan aloqa xatoligi");
    } finally {
      setIsCashierAllOrdersLoading(false);
    }
  }, []);
  const fetchCashierAllOrdersRef = useRef(fetchCashierAllOrders);
  fetchCashierAllOrdersRef.current = fetchCashierAllOrders;

  const fetchRegistrationPatients = useCallback(async () => {
    setIsRegistrationPatientsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/registration-patients?limit=${encodeURIComponent(registrationPatientsLimit)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || "Registratsiya bemorlarini olishda xatolik");
        return;
      }
      setRegistrationPatientsData(data);
    } catch (_error) {
      window.alert("Registratsiya bemorlari: server bilan aloqa xatoligi");
    } finally {
      setIsRegistrationPatientsLoading(false);
    }
  }, [registrationPatientsLimit]);

  const filteredRegistrationPatients = useMemo(() => {
    const list = Array.isArray(registrationPatientsData?.patients) ? registrationPatientsData.patients : [];
    const q = String(registrationPatientsQuery || "")
      .trim()
      .toLowerCase();
    if (!q) return list;
    return list.filter((patient) => {
      const fullName = [patient?.patientFirstName, patient?.patientLastName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return fullName.includes(q);
    });
  }, [registrationPatientsData, registrationPatientsQuery]);
  const reportDashboard = useMemo(() => {
    const rows = Array.isArray(reportData?.rows) ? reportData.rows : [];
    const ticketLog = Array.isArray(reportData?.ticketLog) ? reportData.ticketLog : [];
    const totalRevenue = Number(reportData?.summary?.totalRevenue || 0);
    const totalTickets = Number(reportData?.summary?.totalTickets || 0);
    const topSections = [...rows]
      .sort((a, b) => Number(b.totalRevenue || 0) - Number(a.totalRevenue || 0))
      .slice(0, 8);
    const byService = new Map();
    ticketLog.forEach((row) => {
      const section = String(row?.section || "-").trim();
      const service = String(row?.service || "Xizmat").trim();
      const key = `${section}:::${service}`;
      const prev = byService.get(key) || { section, service, count: 0, totalRevenue: 0 };
      prev.count += 1;
      prev.totalRevenue += Number(row?.price || 0);
      byService.set(key, prev);
    });
    const topServices = Array.from(byService.values())
      .sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue))
      .slice(0, 8);
    const byDay = new Map();
    ticketLog.forEach((row) => {
      const day = String(row?.createdAt || "").slice(0, 10);
      if (!day) return;
      const prev = byDay.get(day) || { day, count: 0, totalRevenue: 0 };
      prev.count += 1;
      prev.totalRevenue += Number(row?.price || 0);
      byDay.set(day, prev);
    });
    const dailyTrend = Array.from(byDay.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)));
    const maxSectionRevenue = topSections.reduce((m, r) => Math.max(m, Number(r.totalRevenue || 0)), 0);
    const maxServiceRevenue = topServices.reduce((m, r) => Math.max(m, Number(r.totalRevenue || 0)), 0);
    const avgTicket = totalTickets > 0 ? Math.round(totalRevenue / totalTickets) : 0;
    return {
      totalRevenue,
      totalTickets,
      avgTicket,
      topSections,
      topServices,
      dailyTrend,
      maxSectionRevenue,
      maxServiceRevenue
    };
  }, [reportData]);

  const printRegistrationPatientSummary = async (patient) => {
    if (!patient) return;
    setPrintingRegistrationPatientKey(patient.groupKey || null);
    try {
      const response = await fetch(`${API_URL}/registration-patients/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: {
            patientFirstName: patient.patientFirstName,
            patientLastName: patient.patientLastName,
            patientPhone: patient.patientPhone
          },
          visits: Array.isArray(patient.visits) ? patient.visits : []
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Umumiy chekni chiqarishda xatolik");
        return;
      }
      window.alert(data.message || "Bemorning umumiy cheki printerga yuborildi.");
    } catch (_error) {
      window.alert("Printer yoki server bilan aloqa xatoligi");
    } finally {
      setPrintingRegistrationPatientKey(null);
    }
  };
  const applyCashierReportFilters = () => {
    const from = String(cashierReportFromDate || "");
    const to = String(cashierReportToDate || "");
    const exact = String(cashierReportExactDate || "");
    const hasRange = Boolean(from || to);
    setCashierAppliedExactDate(hasRange ? "" : exact);
    setCashierAppliedFromDate(from);
    setCashierAppliedToDate(to);
    setCashierAppliedSection(String(cashierReportSection || "").trim());
    setCashierAppliedPatientQuery(String(cashierReportPatientQuery || "").trim());
    setCashierFilterApplied(true);
  };
  const resetCashierReportFilters = () => {
    setCashierReportExactDate("");
    setCashierReportFromDate("");
    setCashierReportToDate("");
    setCashierReportSection("");
    setCashierReportPatientQuery("");
    setCashierAppliedExactDate("");
    setCashierAppliedFromDate("");
    setCashierAppliedToDate("");
    setCashierAppliedSection("");
    setCashierAppliedPatientQuery("");
    setCashierFilterApplied(false);
  };
  const cashierReportRows = useMemo(() => {
    const rows = Array.isArray(cashierReportsData?.rows) ? cashierReportsData.rows : [];
    const from = String(cashierAppliedFromDate || "");
    const to = String(cashierAppliedToDate || "");
    const exact = String(cashierAppliedExactDate || "");
    const section = String(cashierAppliedSection || "");
    const q = String(cashierAppliedPatientQuery || "").toLowerCase();
    return rows.filter((row) => {
      const day = String(row?.createdAt || "").slice(0, 10);
      if (exact) {
        if (day !== exact) return false;
      } else {
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      if (section && getCashierReportDepartmentLabel(row) !== section) return false;
      if (q) {
        const full = `${String(row?.patientFirstName || "")} ${String(row?.patientLastName || "")}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [
    cashierReportsData,
    cashierAppliedFromDate,
    cashierAppliedToDate,
    cashierAppliedExactDate,
    cashierAppliedSection,
    cashierAppliedPatientQuery
  ]);
  const cashierPendingGroups = useMemo(() => {
    const groups = new Map();
    (Array.isArray(cashierPendingRows) ? cashierPendingRows : []).forEach((row) => {
      const ticketId = String(row?.id || row?.ticketId || "").trim();
      if (!ticketId) return;
      const key = getRegistrationBatchOrFallbackKey(row, ticketId);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          ticketIds: [],
          createdAt: String(row?.createdAt || ""),
          patientFirstName: String(row?.patientFirstName || "").trim(),
          patientLastName: String(row?.patientLastName || "").trim(),
          patientPhone: String(row?.patientPhone || "").trim(),
          lineItems: [],
          total: 0
        });
      }
      const g = groups.get(key);
      g.ticketIds.push(ticketId);
      g.lineItems.push({
        ticketId,
        service: String(row?.service || "Xizmat"),
        price: Number(row?.price || 0)
      });
      g.total += Number(row?.price || 0);
      if (String(row?.createdAt || "") > g.createdAt) g.createdAt = String(row?.createdAt || "");
      if (!g.patientPhone && row?.patientPhone) g.patientPhone = String(row.patientPhone || "").trim();
    });
    return Array.from(groups.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [cashierPendingRows]);
  const cashierCancelledRows = useMemo(() => {
    const rows = Array.isArray(cashierAllOrdersData?.rows) ? cashierAllOrdersData.rows : [];
    return rows.filter((row) => String(row?.cashierStatus || "").toLowerCase() === "cancelled").slice(0, 30);
  }, [cashierAllOrdersData]);
  const confirmCashierPendingGroup = async (group) => {
    const ticketIds = Array.isArray(group?.ticketIds) ? group.ticketIds : [];
    if (!ticketIds.length) return;
    if (!cashierActorId) {
      window.alert("Avval kassa foydalanuvchisini tanlang");
      return;
    }
    setPendingActionKey(String(group?.key || ""));
    try {
      const response = await fetch(`${PUBLIC_API_URL}/cashier/confirm-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashierId: cashierActorId, ticketIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Tasdiqlashda xatolik");
        return;
      }
      await Promise.all([
        fetchCashierPendingOrdersRef.current(),
        fetchCashierAllOrdersRef.current(),
        fetchCashierReportsLogRef.current()
      ]);
    } catch (_error) {
      window.alert("Tasdiqlashda server bilan aloqa xatoligi");
    } finally {
      setPendingActionKey("");
    }
  };
  const cancelCashierPendingGroup = async (group) => {
    const ticketIds = Array.isArray(group?.ticketIds) ? group.ticketIds : [];
    if (!ticketIds.length) return;
    if (!cashierActorId) {
      window.alert("Avval kassa foydalanuvchisini tanlang");
      return;
    }
    const reason = String(pendingCancelReason || "").trim();
    if (reason.length < 3) {
      window.alert("Bekor qilish sababi kamida 3 harf bo'lsin");
      return;
    }
    setPendingActionKey(String(group?.key || ""));
    try {
      const response = await fetch(`${PUBLIC_API_URL}/cashier/cancel-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashierId: cashierActorId, ticketIds, reason })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Bekor qilishda xatolik");
        return;
      }
      await Promise.all([
        fetchCashierPendingOrdersRef.current(),
        fetchCashierAllOrdersRef.current(),
        fetchCashierReportsLogRef.current()
      ]);
    } catch (_error) {
      window.alert("Bekor qilishda server bilan aloqa xatoligi");
    } finally {
      setPendingActionKey("");
    }
  };
  const cashierReportGroupedRows = useMemo(() => {
    const rows = Array.isArray(cashierReportRows) ? cashierReportRows : [];
    const groups = new Map();

    rows.forEach((row) => {
      const firstName = String(row?.patientFirstName || "").trim();
      const lastName = String(row?.patientLastName || "").trim();
      const fullName = `${firstName} ${lastName}`.trim() || "—";
      const timeBucket = String(row?.createdAt || "").slice(0, 16);
      const ticketId = String(row?.ticketId || "");
      const ticketBatch = ticketId.includes("-") ? ticketId.split("-").slice(0, -1).join("-") : "";
      const batchId = String(row?.batchId || row?.groupId || ticketBatch).trim();
      const groupKey = `${batchId}|${fullName.toLowerCase()}|${timeBucket}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupKey,
          batchId,
          createdAt: row?.createdAt,
          patientName: fullName,
          patientPhone: String(row?.patientPhone || "").trim() || "—",
          departments: new Set(),
          paymentMethods: new Set(),
          services: [],
          totalPrice: 0
        });
      }

      const target = groups.get(groupKey);
      const departmentLabel = getCashierReportDepartmentLabel(row);
      target.departments.add(departmentLabel);
      target.paymentMethods.add(formatPaymentMethodLabel(row?.paymentMethod));
      target.services.push({
        ticketId: row?.ticketId,
        service: String(row?.service || "—").trim() || "—",
        department: departmentLabel,
        price: Number(row?.price || 0)
      });
      target.totalPrice += Number(row?.price || 0);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        departmentsLabel: Array.from(group.departments).filter(Boolean).join(", "),
        paymentMethodLabel: Array.from(group.paymentMethods).filter(Boolean).join(", ") || "Naqd pul"
      }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [cashierReportRows, getCashierReportDepartmentLabel]);
  const cashierReportSections = useMemo(() => {
    const rows = Array.isArray(cashierReportsData?.rows) ? cashierReportsData.rows : [];
    return Array.from(new Set(rows.map((row) => getCashierReportDepartmentLabel(row)).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "uz")
    );
  }, [cashierReportsData]);
  const cashierReportDashboard = useMemo(() => {
    const rows = Array.isArray(cashierReportRows) ? cashierReportRows : [];
    const totalRevenue = rows.reduce((sum, row) => sum + Number(row?.price || 0), 0);
    const totalChecks = rows.length;
    const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;

    const byDepartment = new Map();
    const byService = new Map();
    const byDay = new Map();

    rows.forEach((row) => {
      const price = Number(row?.price || 0);
      const department = getCashierReportDepartmentLabel(row);
      const service = String(row?.service || "Xizmat ko'rsatilmagan").trim();
      const day = String(row?.createdAt || "").slice(0, 10) || "Noma'lum sana";

      byDepartment.set(department, (byDepartment.get(department) || 0) + price);
      byService.set(service, (byService.get(service) || 0) + price);
      byDay.set(day, {
        day,
        totalRevenue: (byDay.get(day)?.totalRevenue || 0) + price,
        count: (byDay.get(day)?.count || 0) + 1
      });
    });

    const topDepartments = Array.from(byDepartment.entries())
      .map(([label, revenue]) => ({ label, revenue: Number(revenue || 0) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    const topServices = Array.from(byService.entries())
      .map(([label, revenue]) => ({ label, revenue: Number(revenue || 0) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    const dailySeries = Array.from(byDay.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)));
    const dailyTrend = dailySeries.slice(-7);

    const maxDepartmentRevenue = topDepartments.reduce((m, x) => Math.max(m, Number(x.revenue || 0)), 0);
    const maxServiceRevenue = topServices.reduce((m, x) => Math.max(m, Number(x.revenue || 0)), 0);
    const maxDailyRevenue = dailyTrend.reduce((m, x) => Math.max(m, Number(x.totalRevenue || 0)), 0);

    return {
      totalRevenue,
      totalChecks,
      avgCheck,
      topDepartments,
      topServices,
      dailySeries,
      dailyTrend,
      maxDepartmentRevenue,
      maxServiceRevenue,
      maxDailyRevenue
    };
  }, [cashierReportRows]);
  const cashierTrendItems = useMemo(() => {
    const all = Array.isArray(cashierReportDashboard.dailySeries) ? cashierReportDashboard.dailySeries : [];
    const exact = String(cashierTrendExactDate || "");
    const from = String(cashierTrendFromDate || "");
    const to = String(cashierTrendToDate || "");
    const hasRange = Boolean(from || to);
    const filtered = all.filter((day) => {
      const key = String(day?.day || "");
      if (exact && !hasRange) return key === exact;
      if (from && key < from) return false;
      if (to && key > to) return false;
      return true;
    });
    if (!exact && !hasRange) return filtered.slice(-7);
    return filtered;
  }, [cashierReportDashboard.dailySeries, cashierTrendExactDate, cashierTrendFromDate, cashierTrendToDate]);
  const cashierTrendMaxRevenue = useMemo(
    () => cashierTrendItems.reduce((m, x) => Math.max(m, Number(x?.totalRevenue || 0)), 0),
    [cashierTrendItems]
  );

  useEffect(() => {
    if (activePage !== PAGES.orders) return undefined;
    void fetchOrdersLog();
    return undefined;
  }, [activePage, ordersLogLimit, fetchOrdersLog]);

  useEffect(() => {
    if (activePage !== PAGES.registrationOrders) return undefined;
    void fetchRegistrationOrdersLog();
    return undefined;
  }, [activePage, registrationOrdersLimit, fetchRegistrationOrdersLog]);
  useEffect(() => {
    if (activePage !== PAGES.cashierReports) return undefined;
    void fetchCashierReportsLog();
    return undefined;
  }, [activePage, cashierReportsLimit, fetchCashierReportsLog]);
  useEffect(() => {
    if (activePage !== PAGES.cashierOrders) return undefined;
    void fetchCashierPendingOrders();
    void fetchCashierAllOrders();
    return undefined;
  }, [activePage, fetchCashierPendingOrders, fetchCashierAllOrders]);

  useEffect(() => {
    const events = new EventSource(`${PUBLIC_API_URL}/events`);
    const refreshByPage = () => {
      fetchConfig();
      if (activePage === PAGES.control) {
        fetchQueueSnapshot();
      }
      if (activePage === PAGES.reports && reportFromDate && reportToDate) {
        fetchReport();
      }
      if (activePage === PAGES.orders) {
        void fetchOrdersLogRef.current();
      }
      if (activePage === PAGES.registrationOrders) {
        void fetchRegistrationOrdersLogRef.current();
      }
      if (activePage === PAGES.cashierReports) {
        void fetchCashierReportsLogRef.current();
      }
      if (activePage === PAGES.cashierOrders) {
        void fetchCashierPendingOrdersRef.current();
        void fetchCashierAllOrdersRef.current();
        void fetchCashierReportsLogRef.current();
      }
    };

    events.addEventListener("state-updated", refreshByPage);
    events.onerror = () => {
      // keep admin data reasonably fresh even if SSE reconnects.
      fetchConfig();
    };

    return () => events.close();
  }, [activePage, reportFromDate, reportToDate]);

  /** Har «Bo'lim» uchun bitta xizmat qatori; shifokor ma'lumotlari bo'limdan keladi. */
  useEffect(() => {
    if (!departments.length) return;
    setServices((prev) => {
      const next = [...prev];
      let changed = false;
      departments.forEach((dept) => {
        const idx = next.findIndex(
          (s) => String(s.section || "").toUpperCase() === String(dept.section || "").toUpperCase()
        );
        if (idx < 0) {
          const row = mergeDoctorFromDepartment({ ...emptyService }, dept);
          row.id = uniqueAmongServices(slugServiceId(dept.section), next, -1);
          row.roomNumber = "";
          row.price = 0;
          next.push(row);
          changed = true;
        } else {
          const cur = next[idx];
          const merged = mergeDoctorFromDepartment(cur, dept);
          merged.id = cur.id;
          merged.roomNumber = cur.roomNumber;
          merged.price = cur.price;
          if (
            cur.doctorFirstName !== merged.doctorFirstName ||
            cur.doctorLastName !== merged.doctorLastName ||
            cur.doctorPhotoUrl !== merged.doctorPhotoUrl ||
            cur.name !== merged.name ||
            cur.section !== merged.section
          ) {
            next[idx] = merged;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [departments]);

  const fetchQueueSnapshot = async () => {
    try {
      const response = await fetch(`${PUBLIC_API_URL}/queues`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setQueueSnapshot(data);
    } catch (_e) {
      /* ignore */
    }
  };

  useEffect(() => {
    if (activePage !== PAGES.control) return undefined;
    fetchQueueSnapshot();
    return undefined;
  }, [activePage]);

  const callNextForService = async (serviceId) => {
    try {
      const response = await fetch(`${PUBLIC_API_URL}/queues/${serviceId}/call-next`, {
        method: "POST"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Chaqirishda xatolik");
        return;
      }
      await fetchQueueSnapshot();
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
    }
  };

  const saveServices = async () => {
    try {
      const payload = services.map((service) => ({
        id: String(service.id || "").trim(),
        name: String(service.name || "").trim(),
        section: String(service.section || "").trim().toUpperCase(),
        roomNumber: String(service.roomNumber || "").trim(),
        price: Number.isFinite(Number(service.price))
          ? Math.round(Number(service.price))
          : 0,
        doctorFirstName: String(service.doctorFirstName || "").trim(),
        doctorLastName: String(service.doctorLastName || "").trim(),
        doctorPhotoUrl: String(service.doctorPhotoUrl || "").trim()
      }));

      const hasInvalid = payload.some(
        (service) =>
          !service.id ||
          !service.name ||
          !service.section ||
          !service.roomNumber ||
          Number.isNaN(service.price) ||
          service.price <= 0 ||
          !service.doctorFirstName ||
          !service.doctorLastName ||
          !service.doctorPhotoUrl
      );
      if (hasInvalid) {
        window.alert(
          "Har bir xizmat uchun to'liq ma'lumot: id, nom, bo'lim, xona raqami, narx (so'm), shifokor (ism, familiya, JPG/PNG rasm)."
        );
        return;
      }

      const response = await fetch(`${API_URL}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: payload })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Xatolik");
        window.alert(data.message || "Xizmatlarni saqlashda xatolik");
        return;
      }
      setServices(data.services);
      setMessage("Xizmatlar saqlandi");
      window.alert("Xizmatlar muvaffaqiyatli saqlandi.");
    } catch (_error) {
      setMessage("Xizmatlarni saqlashda server xatoligi");
      window.alert("Xizmatlarni saqlashda server xatoligi");
    }
  };
  const addService = () => {
    const selectedSection = String(newService.section || "").trim().toUpperCase();
    const dept = departments.find((d) => String(d.section || "").toUpperCase() === selectedSection);
    if (!dept) {
      window.alert("Avval bo'limni tanlang.");
      return;
    }
    const alreadyExists = services.some(
      (s) => String(s.section || "").trim().toUpperCase() === selectedSection
    );
    if (alreadyExists) {
      window.alert("Bu bo'lim allaqachon qo'shilgan.");
      return;
    }
    const roomNumber = String(newService.roomNumber || "").trim();
    const price = Number.isFinite(Number(newService.price)) ? Math.round(Number(newService.price)) : 0;
    if (!roomNumber || price <= 0) {
      window.alert("Xona raqami va narxni to'ldiring.");
      return;
    }

    let row = mergeDoctorFromDepartment({ ...emptyService, ...newService }, dept);
    row.section = selectedSection;
    row.roomNumber = roomNumber;
    row.price = price;
    row.id = uniqueAmongServices(slugServiceId(selectedSection), services, -1);
    setServices((prev) => [...prev, row]);
    setNewService({ ...emptyService });
    setIsAddServiceModalOpen(false);
  };

  const removeService = (serviceId) => {
    if (!window.confirm("Ushbu xizmatni ro'yxatdan o'chirasizmi?")) return;
    setServices((prev) => prev.filter((service) => service.id !== serviceId));
    setMessage("Xizmat ro'yxatdan olib tashlandi. O'zgarishni saqlash uchun «Xizmatlarni saqlash»ni bosing.");
  };

  const saveDepartments = async () => {
    try {
      const payload = departments.map((d) => ({
        section: String(d.section || "").trim().toUpperCase(),
        title: String(d.title || "").trim(),
        doctorFirstName: String(d.doctorFirstName || "").trim(),
        doctorLastName: String(d.doctorLastName || "").trim(),
        doctorLogin: String(d.doctorLogin || "").trim(),
        doctorPassword: String(d.doctorPassword || "").trim(),
        doctorPhotoUrl: String(d.doctorPhotoUrl || "").trim()
      }));

      const bad = payload.some(
        (d) =>
          !d.section ||
          !d.doctorFirstName ||
          !d.doctorLastName ||
          !d.doctorPhotoUrl
      );
      if (bad) {
        window.alert(
          "Har bir bo'lim uchun: bo'lim kodi, shifokor ism/familiya va rasm to'liq bo'lishi kerak."
        );
        return;
      }

      const sections = new Set();
      for (const d of payload) {
        if (sections.has(d.section)) {
          window.alert(`Bo'lim kodi takrorlanmas: ${d.section}`);
          return;
        }
        sections.add(d.section);
      }

      const response = await fetch(`${API_URL}/departments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departments: payload })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Xatolik");
        window.alert(data.message || "Bo'limlarni saqlashda xatolik");
        return;
      }
      setDepartments(data.departments);
      await fetchConfig();
      setMessage("Bo'limlar saqlandi");
      window.alert("Bo'limlar muvaffaqiyatli saqlandi.");
    } catch (_e) {
      window.alert("Bo'limlarni saqlashda server xatoligi");
    }
  };

  const persistRegistrations = async (nextRegistrations = registrations, successMessage = "Registratsiyalar saqlandi.") => {
    try {
      const payload = nextRegistrations.map((c, i) => ({
        id: String(c.id || `registration-${i + 1}`).trim(),
        name: String(c.name || "").trim(),
        login: String(c.login || "").trim(),
        password: String(c.password || "").trim(),
        enabled: c.enabled !== false
      }));
      const bad = payload.some((c) => !c.name || !c.login || !c.password);
      if (bad) {
        window.alert("Registratsiya uchun: nom, login va parol to'g'ri bo'lsin.");
        return;
      }
      const response = await fetch(`${API_URL}/registrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrations: payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Registratsiyalarni saqlashda xatolik");
        return false;
      }
      const saved = data.registrations || payload;
      setRegistrations(saved);
      lastSavedRegistrationsRef.current = JSON.stringify(saved);
      window.alert(successMessage);
      return true;
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
      return false;
    }
  };

  const saveRegistrations = async () => {
    await persistRegistrations(registrations);
  };

  const saveCashierPrinter = async () => {
    try {
      const response = await fetch(`${API_URL}/cashier-printer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashierPrinterTarget: String(cashierPrinterTarget || "").trim(),
          cashierPrinterPort
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Kassa printerini saqlashda xatolik");
        return;
      }
      setCashierPrinterTarget(data.cashierPrinterTarget || "");
      setCashierPrinterPort(Number(data.cashierPrinterPort) || 9100);
      window.alert("Kassa printeri saqlandi. Tasdiqlangan cheklar shu manzilga chiqadi.");
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
    }
  };

  const saveCashierPrinterFromDevice = async (uri) => {
    try {
      const response = await fetch(`${API_URL}/cashier-printer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashierPrinterTarget: uri,
          cashierPrinterPort
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Kassa printerini saqlashda xatolik");
        return;
      }
      setCashierPrinterTarget(data.cashierPrinterTarget || uri);
      setCashierPrinterPort(Number(data.cashierPrinterPort) || 9100);
      window.alert("Kassa printeri tanlandi va saqlandi.");
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
    }
  };

  const saveCashiers = async () => {
    try {
      const payload = cashiers.map((c, i) => ({
        id: String(c.id || `cashier-${i + 1}`).trim(),
        name: String(c.name || "").trim(),
        login: String(c.login || "").trim(),
        password: String(c.password || "").trim(),
        enabled: c.enabled !== false
      }));
      const bad = payload.some(
        (c) =>
          !c.id ||
          !c.name ||
          !c.login ||
          !c.password
      );
      if (bad) {
        window.alert("Kassa uchun id, ism, login va parol majburiy.");
        return;
      }
      const response = await fetch(`${API_URL}/cashiers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashiers: payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Kassalarni saqlashda xatolik");
        return;
      }
      setCashiers(Array.isArray(data.cashiers) ? data.cashiers : payload);
      window.alert("Kassalar saqlandi.");
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
    }
  };

  const persistRegistrationServices = async (
    nextServices = registrationServices,
    successMessage = "Registratsiya xizmatlari saqlandi."
  ) => {
    try {
      if (!registrationDepartments.length) {
        window.alert("Avval «Registratsiya bo'limlari» sahifasida kamida bitta bo'lim qo'shing.");
        return false;
      }
      const payload = nextServices.map((s) => ({
        id: String(s.id || "").trim(),
        section: String(s.section || "").trim().toUpperCase(),
        name: String(s.name || "").trim(),
        doctorName: String(s.doctorName || "").trim(),
        price: Number(s.price || 0)
      }));
      const bad = payload.some(
        (s) => !s.section || !s.name || !Number.isFinite(s.price) || s.price <= 0
      );
      if (bad) {
        window.alert("Registratsiya xizmatlarida bo'lim, nom va narx (0 dan katta) majburiy.");
        return;
      }
      if (registrationDepartments.length) {
        const validSections = new Set(registrationDepartments.map((d) => String(d.section || "").trim().toUpperCase()));
        const unknown = payload.find((s) => !validSections.has(String(s.section || "").trim().toUpperCase()));
        if (unknown) {
          window.alert(`Registratsiya xizmati uchun bo'lim topilmadi: ${unknown.section}`);
          return;
        }
      }
      const response = await fetch(`${API_URL}/registration-services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationServices: payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Registratsiya xizmatlarini saqlashda xatolik");
        return false;
      }
      const saved = data.registrationServices || payload;
      setRegistrationServices(saved);
      lastSavedRegistrationServicesRef.current = JSON.stringify(saved);
      window.alert(successMessage);
      return true;
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
      return false;
    }
  };

  const saveRegistrationServices = async () => {
    await persistRegistrationServices(registrationServices);
  };

  const persistRegistrationDepartments = async (
    nextDepartments = registrationDepartments,
    successMessage = "Registratsiya bo'limlari saqlandi."
  ) => {
    try {
      const payload = nextDepartments.map((d) => ({
        section: String(d.section || "").trim().toUpperCase(),
        title: String(d.title || "").trim()
      }));
      const bad = payload.some((d) => !d.section);
      if (bad) {
        window.alert("Registratsiya bo'limida bo'lim kodi majburiy.");
        return;
      }
      const sections = new Set();
      for (const d of payload) {
        if (sections.has(d.section)) {
          window.alert(`Registratsiya bo'lim kodi takrorlanmas bo'lsin: ${d.section}`);
          return;
        }
        sections.add(d.section);
      }
      const response = await fetch(`${API_URL}/registration-departments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationDepartments: payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Registratsiya bo'limlarini saqlashda xatolik");
        return false;
      }
      const saved = data.registrationDepartments || payload;
      setRegistrationDepartments(saved);
      lastSavedRegistrationDepartmentsRef.current = JSON.stringify(saved);
      window.alert(successMessage);
      return true;
    } catch (_e) {
      window.alert("Server bilan aloqa yo'q");
      return false;
    }
  };

  const saveRegistrationDepartments = async () => {
    await persistRegistrationDepartments(registrationDepartments);
  };

  const addRegistrationDepartment = () => {
    const section = String(newRegistrationDepartmentDraft.section || "").trim().toUpperCase();
    const title = String(newRegistrationDepartmentDraft.title || "").trim();
    if (!section) {
      window.alert("Bo'lim kodini kiriting.");
      return;
    }
    if (registrationDepartments.some((d) => String(d.section || "").trim().toUpperCase() === section)) {
      window.alert("Bu registratsiya bo'lim kodi allaqachon mavjud.");
      return;
    }
    setRegistrationDepartments((prev) => [...prev, { section, title }]);
    setNewRegistrationDepartmentDraft(emptyRegistrationDepartmentDraft);
    setMessage("Bo'lim qo'shildi. Saqlash tugmasini bosgandan keyin serverga yoziladi.");
  };

  const openAddRegistrationModal = () => {
    setNewRegistrationDraft({ ...emptyRegistrationDraft });
    setIsAddRegistrationModalOpen(true);
  };

  const removeRegistrationAt = (index) => {
    const row = registrations[index];
    const label = String(row?.name || row?.login || row?.id || "").trim() || "Bu registratsiya";
    if (
      !window.confirm(
        `«${label}» o'chirilsinmi?`
      )
    ) {
      return;
    }
    setRegistrations((prev) => prev.filter((_, i) => i !== index));
    setMessage("Registratsiya o'chirildi. Saqlash tugmasini bossangiz serverga yoziladi.");
  };

  const addRegistrationFromModal = async () => {
    const name = String(newRegistrationDraft.name || "").trim();
    const login = String(newRegistrationDraft.login || "").trim();
    const password = String(newRegistrationDraft.password || "").trim();
    if (!name || !login || !password) {
      window.alert("Registratsiya nomi, login va parol to'g'ri bo'lsin.");
      return;
    }
    const next = [
      ...registrations,
      {
        id: "",
        name,
        login,
        password,
        enabled: newRegistrationDraft.enabled !== false
      }
    ];
    setRegistrations(next);
    setNewRegistrationDraft({ ...emptyRegistrationDraft });
    setIsAddRegistrationModalOpen(false);
    setMessage("Registratsiya qo'shildi. Saqlash tugmasini bossangiz serverga yoziladi.");
  };

  const addRegistrationServiceFromModal = async () => {
    if (!registrationDepartments.length) {
      window.alert("Avval «Registratsiya bo'limlari» sahifasida bo'lim qo'shing.");
      return;
    }
    const section = String(newRegistrationService.section || "").trim().toUpperCase();
    const name = String(newRegistrationService.name || "").trim();
    const doctorName = String(newRegistrationService.doctorName || "").trim();
    const price = Number(newRegistrationService.price || 0);
    if (!section || !name || !Number.isFinite(price) || price <= 0) {
      window.alert("Bo'lim, xizmat nomi va narxi to'g'ri bo'lsin.");
      return;
    }
    const next = [...registrationServices, { section, name, doctorName, price }];
    const ok = await persistRegistrationServices(next, "Registratsiya xizmati qo'shildi va saqlandi.");
    if (!ok) return;
    setRegistrationServices(next);
    setNewRegistrationService({ section: "", name: "", doctorName: "", price: 0 });
    setIsRegistrationServiceModalOpen(false);
  };

  useEffect(() => {
    if (isHydratingRef.current || isRegistrationServiceModalOpen) return undefined;
    const snapshot = JSON.stringify(registrationServices);
    if (snapshot === lastSavedRegistrationServicesRef.current) return undefined;
    const timer = setTimeout(() => {
      void persistRegistrationServices(registrationServices, "Registratsiya xizmatlari avtomatik saqlandi.");
    }, 700);
    return () => clearTimeout(timer);
  }, [registrationServices, isRegistrationServiceModalOpen]);

  useEffect(() => {
    if (isHydratingRef.current) return;
    registrationsDirtyRef.current = JSON.stringify(registrations) !== lastSavedRegistrationsRef.current;
  }, [registrations]);

  useEffect(() => {
    if (isHydratingRef.current) return;
    registrationDepartmentsDirtyRef.current =
      JSON.stringify(registrationDepartments) !== lastSavedRegistrationDepartmentsRef.current;
  }, [registrationDepartments]);

  const addDepartment = () => {
    const normalized = {
      section: String(newDepartment.section || "").trim().toUpperCase(),
      title: String(newDepartment.title || "").trim(),
      doctorFirstName: String(newDepartment.doctorFirstName || "").trim(),
      doctorLastName: String(newDepartment.doctorLastName || "").trim(),
      doctorLogin: String(newDepartment.doctorLogin || "").trim(),
      doctorPassword: String(newDepartment.doctorPassword || "").trim(),
      doctorPhotoUrl: String(newDepartment.doctorPhotoUrl || "").trim()
    };
    if (
      !normalized.section ||
      !normalized.doctorFirstName ||
      !normalized.doctorLastName ||
      !normalized.doctorPhotoUrl
    ) {
      window.alert("Yangi bo'lim uchun kod, shifokor ism/familiya va rasmni to'ldiring.");
      return;
    }
    if (departments.some((d) => String(d.section).toUpperCase() === normalized.section)) {
      window.alert("Bu bo'lim kodi allaqachon mavjud.");
      return;
    }
    setDepartments([...departments, normalized]);
    setNewDepartment({ ...emptyDepartment });
  };

  const savePrinter = async () => {
    const trimmedTarget = String(printerTarget || "").trim();
    if (!trimmedTarget) {
      window.alert("Printer tanlanmagan. Avval printerni tanlang.");
      return;
    }

    if (printers.length > 0 && !selectedPrinterUri) {
      window.alert("Iltimos, Device ro'yxatidan printerni aniq tanlang.");
      return;
    }

    const response = await fetch(`${API_URL}/printer`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerTarget: trimmedTarget, printerPort })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Xatolik");
      window.alert(data.message || "Printerni saqlab bo'lmadi");
      return;
    }
    setPrinterTarget(data.printerTarget || trimmedTarget);
    setPrinterPort(data.printerPort || printerPort);
    setSelectedPrinterUri(data.printerTarget || trimmedTarget);
    setMessage("Printer sozlamasi saqlandi");
    window.alert(
      isZbPrinter(data.printerTarget || trimmedTarget)
        ? "ZB printer muvaffaqiyatli saqlandi."
        : "Printer muvaffaqiyatli saqlandi."
    );
  };

  const savePrinterFromDevice = async (uri) => {
    const response = await fetch(`${API_URL}/printer`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerTarget: uri, printerPort })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Printerni saqlab bo'lmadi");
      window.alert(data.message || "Printerni saqlab bo'lmadi");
      return;
    }
    setPrinterTarget(data.printerTarget || uri);
    setPrinterPort(data.printerPort || printerPort);
    setSelectedPrinterUri(data.printerTarget || uri);
    setMessage("Device printer saqlandi");
    window.alert(
      isZbPrinter(data.printerTarget || uri)
        ? "ZB printer tanlandi va saqlandi."
        : "Printer tanlandi va saqlandi."
    );
  };

  const loadDevicePrinters = async () => {
    setIsLoadingDevicePrinters(true);
    try {
      const response = await fetch(`${API_URL}/printers`);
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Printerlarni olishda xatolik");
        window.alert(data.message || "Printerlarni olishda xatolik");
        return;
      }
      const list = data.printers || [];
      setPrinters(list);
      const selected = list.find((item) => item.uri === printerTarget);
      setSelectedPrinterUri(selected ? selected.uri : "");
    } catch (_e) {
      window.alert("Printerlarni aniqlashda server bilan aloqa yo'q");
    } finally {
      setIsLoadingDevicePrinters(false);
    }
  };

  const handleSelectPrinter = (printer) => {
    setPrinterTarget(printer.uri);
    setSelectedPrinterUri(printer.uri);
    window.alert(
      isZbPrinter(printer.uri) || isZbPrinter(printer.queue)
        ? `ZB printer tanlandi: ${printer.queue}`
        : `Printer tanlandi: ${printer.queue}`
    );
  };

  const fetchReport = async () => {
    if (!reportFromDate || !reportToDate) {
      window.alert("Boshlanish va tugash sanasini kiriting.");
      return;
    }
    setIsReportLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/reports?fromDate=${encodeURIComponent(reportFromDate)}&toDate=${encodeURIComponent(reportToDate)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || "Hisobotni olishda xatolik");
        return;
      }
      setReportData(data);
    } catch (_error) {
      window.alert("Hisobotni olishda server xatoligi");
    } finally {
      setIsReportLoading(false);
    }
  };

  const printReportRow = async (row) => {
    if (!row) return;
    try {
      const response = await fetch(`${API_URL}/reports/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportRow: row,
          fromDate: reportFromDate,
          toDate: reportToDate
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Hisobot chekini chiqarishda xatolik");
        return;
      }
      window.alert("Hisobot cheki printerga yuborildi.");
    } catch (_error) {
      window.alert("Printer bilan aloqa xatoligi");
    }
  };

  const printReportSummary = async () => {
    if (!reportData?.rows?.length) {
      window.alert("Avval hisobotni chiqarib oling.");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/reports/print-total`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: reportData.rows,
          summary: reportData.summary,
          fromDate: reportFromDate,
          toDate: reportToDate
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Umumiy chekni chiqarishda xatolik");
        return;
      }
      window.alert("Umumiy hisobot cheki printerga yuborildi.");
    } catch (_error) {
      window.alert("Printer bilan aloqa xatoligi");
    }
  };

  const printOrderTicket = async (row) => {
    const tid = row?.ticketId;
    if (!tid) return;
    setPrintingOrderTicketId(tid);
    try {
      const ticket = buildTicketFromOrderRow(row);
      const response = await fetch(`${PUBLIC_API_URL}/printer/print-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Chekni chiqarishda xatolik");
        return;
      }
      window.alert(data.message || "Chek printerga yuborildi.");
    } catch (_e) {
      window.alert("Printer yoki server bilan aloqa xatoligi");
    } finally {
      setPrintingOrderTicketId(null);
    }
  };
  const reprintCashierReceipt = async (group) => {
    const ticketId = String(group?.services?.[0]?.ticketId || "").trim();
    if (!ticketId) return;
    setPrintingOrderTicketId(ticketId);
    try {
      const response = await fetch(`${PUBLIC_API_URL}/cashier/reprint-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Qayta chek chiqarishda xatolik");
        return;
      }
      window.alert(data.message || "Qayta chek kassa printeriga yuborildi.");
    } catch (_error) {
      window.alert("Printer yoki server bilan aloqa xatoligi");
    } finally {
      setPrintingOrderTicketId(null);
    }
  };

  const navBtn = (id, label, Icon) => (
    <TapButton
      type="button"
      onClick={() => setActivePage(id)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
        activePage === id
          ? "bg-teal-500 text-black"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {Icon ? <Icon /> : null}
      <span className="min-w-0 leading-snug">{label}</span>
    </TapButton>
  );
  const isRegistrationGroupActive =
    activePage === PAGES.registration ||
    activePage === PAGES.registrationDepartments ||
    activePage === PAGES.registrationServices ||
    activePage === PAGES.registrationOrders;
  const isCashierGroupActive =
    activePage === PAGES.cashier || activePage === PAGES.cashierOrders || activePage === PAGES.cashierReports;
  const isKorikGroupActive =
    activePage === PAGES.control ||
    activePage === PAGES.orders ||
    activePage === PAGES.reports ||
    activePage === PAGES.departments ||
    activePage === PAGES.services ||
    activePage === PAGES.printer;
  const korikChildBtn = (id, label) => (
    <TapButton
      type="button"
      onClick={() => setActivePage(id)}
      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        activePage === id ? "bg-teal-500/90 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
      } md:pl-9`}
    >
      <span className="min-w-0 leading-snug">{label}</span>
    </TapButton>
  );
  const registrationChildBtn = (id, label) => (
    <TapButton
      type="button"
      onClick={() => setActivePage(id)}
      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        activePage === id ? "bg-teal-500/90 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
      } md:pl-9`}
    >
      <span className="min-w-0 leading-snug">{label}</span>
    </TapButton>
  );
  const cashierChildBtn = (id, label) => (
    <TapButton
      type="button"
      onClick={() => setActivePage(id)}
      className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        activePage === id ? "bg-teal-500/90 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
      } md:pl-9`}
    >
      <span className="min-w-0 leading-snug">{label}</span>
    </TapButton>
  );

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#0a0a0b] md:flex-row">
      <aside className="flex w-full shrink-0 flex-row items-center gap-2 overflow-x-auto border-b border-white/10 bg-black/50 p-3 md:w-56 md:flex-col md:items-stretch md:gap-1 md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:p-4">
        <div className="hidden md:block mb-6 pr-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Sherdor</p>
          <p className="text-lg font-bold text-white leading-tight">Admin</p>
        </div>
        <p className="md:hidden text-xs font-bold text-white/90 shrink-0 w-14">Admin</p>
        <div className="flex md:flex-col flex-1 gap-2 md:gap-1 md:flex-1 min-w-0">
          <div className="w-full">
            <TapButton
              type="button"
              onClick={() => {
                setActivePage(PAGES.control);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                isKorikGroupActive ? "bg-teal-500 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <IconControl />
              <span className="min-w-0 flex-1 leading-snug">Ko'rik</span>
              <TapButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsKorikMenuOpen((v) => !v);
                }}
                className={`shrink-0 text-base font-bold leading-none transition-transform duration-150 ${isKorikMenuOpen ? "rotate-90" : "rotate-0"}`}
              >
                {">"}
              </TapButton>
            </TapButton>
            <AnimatePresence initial={false}>
              {isKorikMenuOpen ? (
                <motion.div
                  key="korik-dropdown"
                  initial={{ height: 0, opacity: 0, y: -4 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="mt-1 space-y-1 overflow-hidden"
                >
                  {korikChildBtn(PAGES.control, "Boshqaruv")}
                  {korikChildBtn(PAGES.printer, "Printer")}
                  {korikChildBtn(PAGES.orders, "Buyurtmalar")}
                  {korikChildBtn(PAGES.reports, "Hisobot")}
                  {korikChildBtn(PAGES.departments, "Bo'limlar")}
                  {korikChildBtn(PAGES.services, "Xizmatlar")}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="w-full">
            <TapButton
              type="button"
              onClick={() => {
                setActivePage(PAGES.cashier);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                isCashierGroupActive ? "bg-teal-500 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <IconSettings />
              <span className="min-w-0 flex-1 leading-snug">Kassa</span>
              <TapButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCashierMenuOpen((v) => !v);
                }}
                className={`shrink-0 text-base font-bold leading-none transition-transform duration-150 ${isCashierMenuOpen ? "rotate-90" : "rotate-0"}`}
              >
                {">"}
              </TapButton>
            </TapButton>
            <AnimatePresence initial={false}>
              {isCashierMenuOpen ? (
                <motion.div
                  key="cashier-dropdown"
                  initial={{ height: 0, opacity: 0, y: -4 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="mt-1 space-y-1 overflow-hidden"
                >
                  {cashierChildBtn(PAGES.cashier, "Sozlamalar")}
                  {cashierChildBtn(PAGES.cashierOrders, "Buyurtmalar")}
                  {cashierChildBtn(PAGES.cashierReports, "Hisobotlar")}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="w-full">
            <TapButton
              type="button"
              onClick={() => {
                setActivePage(PAGES.registration);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                isRegistrationGroupActive ? "bg-teal-500 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <IconRegistration />
              <span className="min-w-0 flex-1 leading-snug">Registratsiya</span>
              <TapButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRegistrationMenuOpen((v) => !v);
                }}
                className={`shrink-0 text-base font-bold leading-none transition-transform duration-150 ${isRegistrationMenuOpen ? "rotate-90" : "rotate-0"}`}
              >
                {">"}
              </TapButton>
            </TapButton>
            <AnimatePresence initial={false}>
              {isRegistrationMenuOpen ? (
                <motion.div
                  key="registration-dropdown"
                  initial={{ height: 0, opacity: 0, y: -4 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="mt-1 space-y-1 overflow-hidden"
                >
                  {registrationChildBtn(PAGES.registration, "Registratsiya (main)")}
                  {registrationChildBtn(PAGES.registrationDepartments, "Registratsiya bo'limlari")}
                  {registrationChildBtn(PAGES.registrationServices, "Registratsiya xizmat")}
                  {registrationChildBtn(PAGES.registrationOrders, "Registratsiya buyurtmalari")}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          {navBtn(PAGES.settings, "Sozlamalar", IconSettings)}
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5 md:p-8 max-w-5xl w-full mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
          {activePage === PAGES.services
            ? "Xizmatlar"
            : activePage === PAGES.departments
              ? "Bo'limlar"
              : activePage === PAGES.registration
                ? "Registratsiya"
              : activePage === PAGES.registrationDepartments
                ? "Registratsiya bo'limlari"
              : activePage === PAGES.registrationServices
                ? "Registratsiya xizmat"
              : activePage === PAGES.registrationOrders
                ? "Registratsiya buyurtmalari"
              : activePage === PAGES.cashier
                ? "Kassa"
              : activePage === PAGES.cashierOrders
                ? "Kassa buyurtmalari"
              : activePage === PAGES.cashierReports
                ? "Kassa hisobotlari"
              : activePage === PAGES.printer
                ? "Printer"
              : activePage === PAGES.reports
                ? "Hisobot"
                : activePage === PAGES.orders
                  ? "Buyurtmalar"
                  : activePage === PAGES.settings
                    ? "Sozlamalar"
                    : "Boshqaruv"}
        </h1>
        <p className="text-xs text-white/45 mb-6">
          {activePage === PAGES.services
            ? "Bo'limlar jadvali: xona va narxni tahrirlang yoki modal orqali yangi xizmat qo'shing."
            : activePage === PAGES.departments
              ? "Har klinika bo'limi uchun shifokor shabloni. Keyin xizmat qo'shishda shu bo'limni tanlasangiz, maydonlar o'zi to'ldiriladi."
              : activePage === PAGES.registration
                ? "Registratsiya login/parollari va alohida printer manzili."
              : activePage === PAGES.registrationDepartments
                ? "Registratsiya bo'limlarini alohida saqlang; keyin registratsiya xizmatlari shu bo'limlarga bog'lanadi."
              : activePage === PAGES.registrationServices
                ? "Registratsiya xizmatlari: bo'limga bog'langan xizmatlar, shifokor ismi va narx."
              : activePage === PAGES.registrationOrders
                ? "Registratsiyada yaratilgan buyurtmalar: har bir chek td/tr jadvalda ko'rinadi va avtomatik yangilanadi."
              : activePage === PAGES.cashier
                ? "Kassa printeri (chek manzili), kassa loginlari. Tasdiqlash cheki shu printerga chiqadi."
              : activePage === PAGES.cashierOrders
                ? "Kassaga tushgan kutilayotgan buyurtmalar. Admin ham tasdiqlash/bekor qilishni real-time boshqara oladi."
              : activePage === PAGES.cashierReports
                ? "Kassadagi hisobotlar bilan bir xil filterlar: sana, bo'lim, bemor qidiruvi. Natija td/tr jadvalda."
              : activePage === PAGES.printer
                ? "Umumiy printer sozlamasi va device printerlarni tanlash."
              : activePage === PAGES.reports
                ? "Ikki sana oralig'ida bo'limlar bo'yicha yig'ma va har bir berilgan chek: sana, bo'lim, xizmat va narx."
                : activePage === PAGES.orders
                  ? "Barcha berilgan navbat cheklari: sana va soat, bo'lim, xizmat, narx. Yangi chek qo'shilganda ro'yxat avtomatik yangilanadi."
                    : activePage === PAGES.settings
                    ? "Lokal bazadagi ma'lumotlarni Atlas'ga qo'lda sync qilish."
                    : "Navbat holati, chaqirish va printer sozlamalari."}
        </p>
        {message ? <p className="mb-4 text-teal-300 text-sm">{message}</p> : null}

        {activePage === PAGES.services ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 sm:p-8 mb-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Xizmatlar</h2>
              <button
                type="button"
                className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-teal-400"
                onClick={() => setIsAddServiceModalOpen(true)}
              >
                Xizmat qo'shish
              </button>
            </div>
            {!departments.length ? (
              <p className="text-sm leading-relaxed text-white/50">
                Avval <strong className="text-teal-300">«Bo'limlar»</strong> sahifasida bo'lim va shifokorni saqlang.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Bo'lim</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Xona raqami</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Narx (so'm)</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Amal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((service, index) => {
                        const dept = departments.find(
                          (d) => String(d.section || "").toUpperCase() === String(service.section || "").toUpperCase()
                        );
                        return (
                          <tr key={`${service.id}-${index}`} className="odd:bg-black/20 even:bg-black/10">
                            <td className="border-b border-white/10 px-4 py-3">
                              <div className="font-semibold text-white">{service.section || "-"}</div>
                              <div className="text-xs text-white/45">{dept?.title || service.name || "-"}</div>
                            </td>
                            <td className="border-b border-white/10 px-4 py-3">
                              <input
                                className="w-full min-w-[140px] rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-white outline-none focus:border-teal-400/55"
                                value={service.roomNumber || ""}
                                onChange={(e) => {
                                  const copy = [...services];
                                  copy[index].roomNumber = e.target.value;
                                  setServices(copy);
                                }}
                                placeholder="Masalan: 12"
                                inputMode="numeric"
                              />
                            </td>
                            <td className="border-b border-white/10 px-4 py-3">
                              <input
                                className="w-full min-w-[180px] rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-white outline-none focus:border-teal-400/55"
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={formatPriceDisplay(service.price)}
                                onChange={(e) => {
                                  const copy = [...services];
                                  copy[index].price = parsePriceDigits(e.target.value);
                                  setServices(copy);
                                }}
                                placeholder="150 000"
                              />
                            </td>
                            <td className="border-b border-white/10 px-4 py-3">
                              <button
                                type="button"
                                className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25"
                                onClick={() => removeService(service.id)}
                              >
                                O'chirish
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <button
              className="mt-8 w-full rounded-xl bg-teal-500 px-6 py-3.5 text-base font-bold text-black shadow-lg shadow-teal-900/25 transition hover:bg-teal-400 sm:w-auto"
              onClick={saveServices}
            >
              Xizmatlarni saqlash
            </button>
          </section>
        ) : null}
        {isAddServiceModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101114] p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Xizmat qo'shish</h3>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
                  onClick={() => setIsAddServiceModalOpen(false)}
                >
                  Yopish
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={fieldLabel}>Bo'lim</label>
                  <select
                    className={`${fieldClass} cursor-pointer`}
                    value={String(newService.section || "").toUpperCase()}
                    onChange={(e) => {
                      const dept = departments.find((d) => d.section === e.target.value);
                      if (!dept) return;
                      setNewService((prev) => mergeDoctorFromDepartment(prev, dept));
                    }}
                  >
                    <option value="">Tanlang…</option>
                    {departments
                      .filter(
                        (d) =>
                          !services.some(
                            (s) =>
                              String(s.section || "").trim().toUpperCase() ===
                              String(d.section || "").trim().toUpperCase()
                          )
                      )
                      .map((d) => (
                        <option key={d.section} value={d.section}>
                          {d.section}
                          {d.title ? ` — ${d.title}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabel}>Xona raqami</label>
                  <input
                    className={`${fieldClass} text-xl font-semibold tracking-wide sm:text-2xl`}
                    value={newService.roomNumber || ""}
                    onChange={(e) => setNewService((prev) => ({ ...prev, roomNumber: e.target.value }))}
                    placeholder="Masalan: 12"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Narx (so'm)</label>
                  <input
                    className={`${fieldClass} font-mono text-xl tabular-nums sm:text-2xl`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={formatPriceDisplay(newService.price)}
                    onChange={(e) => setNewService((prev) => ({ ...prev, price: parsePriceDigits(e.target.value) }))}
                    placeholder="150 000"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/75 hover:bg-white/10"
                  onClick={() => setIsAddServiceModalOpen(false)}
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-teal-500 px-5 py-2 text-sm font-bold text-black hover:bg-teal-400"
                  onClick={addService}
                >
                  Qo'shish
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activePage === PAGES.departments ? (
      <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-2 sr-only">Bo'limlar ro'yxati</h2>
        <div className="space-y-4">
          {departments.map((dept, index) => (
            <div
              key={dept.section + index}
              className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2 font-mono font-bold"
                  value={dept.section}
                  onChange={(e) => {
                    const copy = [...departments];
                    copy[index].section = e.target.value.toUpperCase();
                    setDepartments(copy);
                  }}
                  placeholder="Bo'lim kodi (masalan A, LOR)"
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={dept.title || ""}
                  onChange={(e) => {
                    const copy = [...departments];
                    copy[index].title = e.target.value;
                    setDepartments(copy);
                  }}
                  placeholder="Bo'lim nomi (ixtiyoriy)"
                />
              </div>
              <p className="text-xs text-white/50 uppercase tracking-wide">Bo'lim shifokori</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={dept.doctorFirstName || ""}
                  onChange={(e) => {
                    const copy = [...departments];
                    copy[index].doctorFirstName = e.target.value;
                    setDepartments(copy);
                  }}
                  placeholder="Ism"
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={dept.doctorLastName || ""}
                  onChange={(e) => {
                    const copy = [...departments];
                    copy[index].doctorLastName = e.target.value;
                    setDepartments(copy);
                  }}
                  placeholder="Familiya"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={dept.doctorLogin || ""}
                  onChange={(e) => {
                    const copy = [...departments];
                    copy[index].doctorLogin = e.target.value;
                    setDepartments(copy);
                  }}
                  placeholder="Doktor login (bo'sh bo'lsa auto)"
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={dept.doctorPassword || ""}
                  onChange={(e) => {
                    const copy = [...departments];
                    copy[index].doctorPassword = e.target.value;
                    setDepartments(copy);
                  }}
                  placeholder="Doktor parol (bo'sh bo'lsa auto)"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {dept.doctorPhotoUrl ? (
                  <img
                    src={resolveDoctorPhotoUrl(dept.doctorPhotoUrl)}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover border border-white/10"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-[10px] text-white/40 px-1 text-center">
                    Rasm
                  </div>
                )}
                <label className="flex flex-col gap-1 text-xs text-white/60">
                  <span className="text-white/80 font-medium">Rasm (JPG / PNG)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    className="text-xs file:mr-2 file:rounded file:border-0 file:bg-teal-500 file:px-2 file:py-1 file:text-black"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const path = await uploadDoctorPhotoFile(file);
                        const copy = [...departments];
                        copy[index].doctorPhotoUrl = path;
                        setDepartments(copy);
                      } catch (err) {
                        window.alert(err.message || "Yuklash xatoligi");
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded bg-white/10 text-white/70"
                  onClick={() => {
                    const copy = [...departments];
                    copy[index].doctorPhotoUrl = "";
                    setDepartments(copy);
                  }}
                >
                  Rasmni olib tashlash
                </button>
                <button
                  type="button"
                  className="ml-auto px-3 py-2 bg-red-500/20 rounded text-sm"
                  onClick={() => setDepartments(departments.filter((_, i) => i !== index))}
                >
                  O'chir
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-teal-500/30 bg-teal-500/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-teal-200">Yangi bo'lim</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2"
              value={newDepartment.section}
              onChange={(e) => setNewDepartment({ ...newDepartment, section: e.target.value })}
              placeholder="Bo'lim kodi"
            />
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2"
              value={newDepartment.title}
              onChange={(e) => setNewDepartment({ ...newDepartment, title: e.target.value })}
              placeholder="Bo'lim nomi (ixtiyoriy)"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2"
              value={newDepartment.doctorFirstName}
              onChange={(e) => setNewDepartment({ ...newDepartment, doctorFirstName: e.target.value })}
              placeholder="Shifokor ismi"
            />
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2"
              value={newDepartment.doctorLastName}
              onChange={(e) => setNewDepartment({ ...newDepartment, doctorLastName: e.target.value })}
              placeholder="Familiya"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2"
              value={newDepartment.doctorLogin}
              onChange={(e) => setNewDepartment({ ...newDepartment, doctorLogin: e.target.value })}
              placeholder="Doktor login (ixtiyoriy)"
            />
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2"
              value={newDepartment.doctorPassword}
              onChange={(e) => setNewDepartment({ ...newDepartment, doctorPassword: e.target.value })}
              placeholder="Doktor parol (ixtiyoriy)"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-white/60">
              Rasm
              <input
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                className="mt-1 block text-xs file:mr-2 file:rounded file:border-0 file:bg-teal-500 file:px-2 file:py-1 file:text-black"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const path = await uploadDoctorPhotoFile(file);
                    setNewDepartment((p) => ({ ...p, doctorPhotoUrl: path }));
                  } catch (err) {
                    window.alert(err.message || "Yuklash xatoligi");
                  }
                }}
              />
            </label>
            {newDepartment.doctorPhotoUrl ? (
              <img
                src={resolveDoctorPhotoUrl(newDepartment.doctorPhotoUrl)}
                alt=""
                className="h-12 w-12 rounded object-cover border border-white/10"
              />
            ) : null}
            <button
              type="button"
              className="px-4 py-2 bg-teal-500 text-black rounded font-semibold text-sm"
              onClick={addDepartment}
            >
              Ro'yxatga qo'sh
            </button>
          </div>
        </div>

        <button className="mt-4 px-4 py-2 bg-teal-500 text-black rounded font-semibold" onClick={saveDepartments}>
          Bo'limlarni saqlash
        </button>
      </section>
        ) : null}

        {activePage === PAGES.reports ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="date"
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                value={reportFromDate}
                onChange={(e) => setReportFromDate(e.target.value)}
              />
              <input
                type="date"
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                value={reportToDate}
                onChange={(e) => setReportToDate(e.target.value)}
              />
              <button
                type="button"
                className="px-4 py-2 bg-teal-500 text-black rounded font-bold"
                onClick={fetchReport}
                disabled={isReportLoading}
              >
                {isReportLoading ? "Yuklanmoqda..." : "Hisobotni ko'rsatish"}
              </button>
            </div>

            {reportData ? (
              <>
                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Jami tushum</p>
                    <p className="mt-1 text-2xl font-extrabold text-teal-300">
                      {Number(reportDashboard.totalRevenue || 0).toLocaleString("uz-UZ")} so&apos;m
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Jami navbatlar</p>
                    <p className="mt-1 text-2xl font-extrabold text-white">
                      {Number(reportDashboard.totalTickets || 0).toLocaleString("uz-UZ")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/45">O&apos;rtacha chek</p>
                    <p className="mt-1 text-2xl font-extrabold text-teal-300">
                      {Number(reportDashboard.avgTicket || 0).toLocaleString("uz-UZ")} so&apos;m
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Faol bo&apos;limlar</p>
                    <p className="mt-1 text-2xl font-extrabold text-white">
                      {Number(reportDashboard.topSections.length || 0)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Bo&apos;limlar bo&apos;yicha tushum</h3>
                    <div className="space-y-2">
                      {reportDashboard.topSections.length === 0 ? (
                        <p className="text-sm text-white/45">Ma&apos;lumot yo&apos;q</p>
                      ) : (
                        reportDashboard.topSections.map((row) => {
                          const revenue = Number(row.totalRevenue || 0);
                          const pct = reportDashboard.maxSectionRevenue > 0
                            ? Math.max(4, Math.round((revenue / reportDashboard.maxSectionRevenue) * 100))
                            : 0;
                          return (
                            <div key={`${row.section}-${row.serviceId}`} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-white/85">{row.section || "-"}</span>
                                <span className="font-bold text-teal-300">{revenue.toLocaleString("uz-UZ")} so&apos;m</span>
                              </div>
                              <div className="h-2 rounded bg-white/10 overflow-hidden">
                                <div className="h-full rounded bg-teal-400" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Xizmatlar TOP (tushum)</h3>
                    <div className="space-y-2">
                      {reportDashboard.topServices.length === 0 ? (
                        <p className="text-sm text-white/45">Ma&apos;lumot yo&apos;q</p>
                      ) : (
                        reportDashboard.topServices.map((row) => {
                          const revenue = Number(row.totalRevenue || 0);
                          const pct = reportDashboard.maxServiceRevenue > 0
                            ? Math.max(4, Math.round((revenue / reportDashboard.maxServiceRevenue) * 100))
                            : 0;
                          return (
                            <div key={`${row.section}-${row.service}`} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-white/85">{row.section} • {row.service}</span>
                                <span className="font-bold text-teal-300">{revenue.toLocaleString("uz-UZ")} so&apos;m</span>
                              </div>
                              <div className="mb-1 h-2 rounded bg-white/10 overflow-hidden">
                                <div className="h-full rounded bg-teal-400" style={{ width: `${pct}%` }} />
                              </div>
                              <p className="m-0 text-[11px] text-white/45">{row.count} ta chek</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <h3 className="text-sm font-bold text-white mb-3">Kunlik trend</h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {reportDashboard.dailyTrend.length === 0 ? (
                      <p className="text-sm text-white/45">Ma&apos;lumot yo&apos;q</p>
                    ) : (
                      reportDashboard.dailyTrend.map((d) => (
                        <div key={d.day} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                          <p className="m-0 text-xs text-white/60">{d.day}</p>
                          <p className="m-0 mt-1 text-sm font-bold text-teal-300">
                            {Number(d.totalRevenue || 0).toLocaleString("uz-UZ")} so&apos;m
                          </p>
                          <p className="m-0 text-[11px] text-white/45">{d.count} ta chek</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-5 text-sm text-white/80 flex flex-wrap gap-5 items-center">
                  <p>
                    Jami navbatlar:{" "}
                    <strong className="text-teal-300">{reportData?.summary?.totalTickets ?? 0}</strong>
                  </p>
                  <p>
                    Jami tushum:{" "}
                    <strong className="text-teal-300">
                      {Number(reportData?.summary?.totalRevenue || 0).toLocaleString("uz-UZ")} so'm
                    </strong>
                  </p>
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-teal-500 text-black text-xs font-black uppercase tracking-wide"
                    onClick={printReportSummary}
                  >
                    Umumiy chekni chiqarish
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Bo'lim kodi</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Bo'lim nomi</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Shifokor</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Navbatlar</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Tushum</th>
                        <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">Chek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportData.rows || []).map((row) => (
                        <tr key={`${row.section}-${row.serviceId}`} className="odd:bg-black/20 even:bg-black/10">
                          <td className="border-b border-white/10 px-4 py-3 font-mono">{row.section || "-"}</td>
                          <td className="border-b border-white/10 px-4 py-3">{row.service || "-"}</td>
                          <td className="border-b border-white/10 px-4 py-3">
                            {[row.doctorFirstName, row.doctorLastName].filter(Boolean).join(" ") || "-"}
                          </td>
                          <td className="border-b border-white/10 px-4 py-3 font-bold">{row.totalTickets}</td>
                          <td className="border-b border-white/10 px-4 py-3 text-teal-300 font-bold">
                            {Number(row.totalRevenue || 0).toLocaleString("uz-UZ")} so'm
                          </td>
                          <td className="border-b border-white/10 px-4 py-3">
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded bg-teal-500 text-black text-xs font-bold"
                              onClick={() => printReportRow(row)}
                            >
                              Chek chiqarish
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="mt-10 text-base font-bold text-white">Berilgan cheklar</h3>
                <p className="text-xs text-white/45 mb-3">
                  Ro&apos;yxat: navbat olingan vaqt (
                  {reportData?.timezone || "Asia/Tashkent"}) bo&apos;yicha.
                </p>
                <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Sana va soat
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Navbat
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Bo&apos;lim</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Shifokor</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Xizmat</th>
                        <th className="border-b border-white/10 px-3 py-3 text-right font-semibold">Narx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportData.ticketLog || []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="border-b border-white/10 px-4 py-6 text-center text-white/45"
                          >
                            Bu sanalar oralig&apos;ida chek topilmadi.
                          </td>
                        </tr>
                      ) : (
                        (reportData.ticketLog || []).map((row) => (
                          <tr key={row.ticketId || `${row.createdAt}-${row.queueCode}`} className="odd:bg-black/20 even:bg-black/10">
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono text-xs whitespace-nowrap text-white/90">
                              {formatReportDateTime(row.createdAt, reportData.timezone)}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono font-bold text-teal-300 whitespace-nowrap">
                              {row.queueCode || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/80">{row.section || "—"}</td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/85">
                              {formatDoctorFromRow(row)}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/80">{row.service || "—"}</td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-right text-white/90 whitespace-nowrap">
                              {Number(row.price || 0).toLocaleString("uz-UZ")} so&apos;m
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activePage === PAGES.orders ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="flex flex-wrap items-end gap-3 mb-5">
              <label className="text-xs text-white/60 block">
                Maks. qatorlar
                <select
                  className="mt-1 block rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white text-sm"
                  value={ordersLogLimit}
                  onChange={(e) => setOrdersLogLimit(Number(e.target.value) || 8000)}
                >
                  <option value={4000}>4 000</option>
                  <option value={8000}>8 000</option>
                  <option value={12000}>12 000</option>
                  <option value={20000}>20 000</option>
                  <option value={50000}>50 000</option>
                </select>
              </label>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-teal-500 text-black font-bold text-sm"
                onClick={() => void fetchOrdersLog()}
                disabled={isOrdersLogLoading}
              >
                {isOrdersLogLoading ? "Yuklanmoqda..." : "Yangilash"}
              </button>
            </div>

            {ordersLogData ? (
              <>
                <div className="text-sm text-white/80 flex flex-wrap gap-4 mb-4">
                  <p>
                    Ko&apos;rsatilgan:{" "}
                    <strong className="text-teal-300">{ordersLogData.summary?.count ?? 0}</strong>
                  </p>
                  <p>
                    Xotirada jami:{" "}
                    <strong className="text-teal-300">{ordersLogData.totalInMemory ?? 0}</strong>
                  </p>
                  {ordersLogData.truncated ? (
                    <p className="text-amber-200/90">Ro&apos;yxat chegaraga yetdi — limitni oshiring.</p>
                  ) : null}
                  <p>
                    Jami narx (ko&apos;rsatilgan):{" "}
                    <strong className="text-teal-300">
                      {Number(ordersLogData.summary?.totalRevenue || 0).toLocaleString("uz-UZ")} so&apos;m
                    </strong>
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Sana va soat
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Navbat
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Bo&apos;lim</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Shifokor</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Xizmat</th>
                        <th className="border-b border-white/10 px-3 py-3 text-right font-semibold">Narx</th>
                        <th className="border-b border-white/10 px-3 py-3 text-center font-semibold whitespace-nowrap">
                          Chek
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ordersLogData.rows || []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="border-b border-white/10 px-4 py-8 text-center text-white/45"
                          >
                            Hozircha berilgan chek yo&apos;q.
                          </td>
                        </tr>
                      ) : (
                        (ordersLogData.rows || []).map((row) => (
                          <tr
                            key={row.ticketId || `${row.createdAt}-${row.queueCode}`}
                            className="odd:bg-black/20 even:bg-black/10"
                          >
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono text-xs whitespace-nowrap text-white/90">
                              {formatReportDateTime(row.createdAt, ordersLogData.timezone)}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono font-bold text-teal-300 whitespace-nowrap">
                              {row.queueCode || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/80">{row.section || "—"}</td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/85">
                              {formatDoctorFromRow(row)}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/80">{row.service || "—"}</td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-right text-white/90 whitespace-nowrap">
                              {Number(row.price || 0).toLocaleString("uz-UZ")} so&apos;m
                            </td>
                            <td className="border-b border-white/10 px-2 py-2.5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md bg-white/10 text-[11px] font-bold text-white hover:bg-teal-500/25 disabled:opacity-50"
                                disabled={printingOrderTicketId === row.ticketId}
                                onClick={() => void printOrderTicket(row)}
                              >
                                {printingOrderTicketId === row.ticketId ? "…" : "Qayta"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/45">{isOrdersLogLoading ? "Yuklanmoqda..." : "Ma'lumot yo'q."}</p>
            )}
          </section>
        ) : null}

        {activePage === PAGES.registrationOrders ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="flex flex-wrap items-end gap-3 mb-5">
              <label className="text-xs text-white/60 block">
                Maks. qatorlar
                <select
                  className="mt-1 block rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white text-sm"
                  value={registrationOrdersLimit}
                  onChange={(e) => setRegistrationOrdersLimit(Number(e.target.value) || 8000)}
                >
                  <option value={4000}>4 000</option>
                  <option value={8000}>8 000</option>
                  <option value={12000}>12 000</option>
                  <option value={20000}>20 000</option>
                  <option value={50000}>50 000</option>
                </select>
              </label>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-teal-500 text-black font-bold text-sm"
                onClick={() => void fetchRegistrationOrdersLog()}
                disabled={isRegistrationOrdersLoading}
              >
                {isRegistrationOrdersLoading ? "Yuklanmoqda..." : "Yangilash"}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-white/10 text-white font-semibold text-sm hover:bg-white/15"
                onClick={() => {
                  setIsRegistrationPatientsModalOpen(true);
                  if (!registrationPatientsData && !isRegistrationPatientsLoading) {
                    void fetchRegistrationPatients();
                  }
                }}
              >
                Bemorlar bo&apos;yicha
              </button>
            </div>

            {registrationOrdersData ? (
              <>
                <div className="text-sm text-white/80 flex flex-wrap gap-4 mb-4">
                  <p>
                    Ko&apos;rsatilgan:{" "}
                    <strong className="text-teal-300">{registrationOrdersData.summary?.count ?? 0}</strong>
                  </p>
                  <p>
                    Xotirada jami:{" "}
                    <strong className="text-teal-300">{registrationOrdersData.totalInMemory ?? 0}</strong>
                  </p>
                  {registrationOrdersData.truncated ? (
                    <p className="text-amber-200/90">Ro&apos;yxat chegaraga yetdi — limitni oshiring.</p>
                  ) : null}
                  <p>
                    Jami narx (ko&apos;rsatilgan):{" "}
                    <strong className="text-teal-300">
                      {Number(registrationOrdersData.summary?.totalRevenue || 0).toLocaleString("uz-UZ")} so&apos;m
                    </strong>
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Sana va soat
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Chek raqami
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Mijoz</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Telefon</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Xizmat</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          To&apos;lov turi
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Status
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Bekor qilgan / izoh
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-right font-semibold">Narx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(registrationOrdersData.rows || []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="border-b border-white/10 px-4 py-8 text-center text-white/45"
                          >
                            Hozircha registratsiyadan tushgan buyurtma yo&apos;q.
                          </td>
                        </tr>
                      ) : (
                        (registrationOrdersData.rows || []).map((row) => (
                          <tr
                            key={row.ticketId || `${row.createdAt}-${row.queueCode}`}
                            className="odd:bg-black/20 even:bg-black/10"
                          >
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono text-xs whitespace-nowrap text-white/90">
                              {formatReportDateTime(row.createdAt, registrationOrdersData.timezone)}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono font-bold text-teal-300 whitespace-nowrap">
                              {row.queueCode || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/85">
                              {[row.patientFirstName, row.patientLastName].filter(Boolean).join(" ") || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/80">
                              {row.patientPhone || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/80">{row.service || "—"}</td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white/90 whitespace-nowrap">
                              {formatPaymentMethodLabel(row.paymentMethod)}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 whitespace-nowrap">
                              {String(row.cashierStatus || "").toLowerCase() === "confirmed" ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                                  Tasdiqlandi
                                </span>
                              ) : String(row.cashierStatus || "").toLowerCase() === "cancelled" ? (
                                <span className="rounded-full border border-red-400/30 bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-200">
                                  Bekor qilindi
                                </span>
                              ) : (
                                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-100">
                                  Kutilmoqda
                                </span>
                              )}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-xs text-white/75">
                              {String(row.cashierStatus || "").toLowerCase() === "cancelled" ? (
                                <div className="space-y-0.5">
                                  <div>
                                    <span className="text-white/45">Kim:</span>{" "}
                                    <span className="text-red-200 font-semibold">
                                      {cashierNameById.get(String(row.cashierId || "").trim()) ||
                                        String(row.cashierId || "").trim() ||
                                        "Noma'lum"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-white/45">Izoh:</span>{" "}
                                    <span className="text-white/85">{row.cashierCancelReason || "—"}</span>
                                  </div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-right text-white/90 whitespace-nowrap">
                              {Number(row.price || 0).toLocaleString("uz-UZ")} so&apos;m
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/45">
                {isRegistrationOrdersLoading ? "Yuklanmoqda..." : "Ma'lumot yo'q."}
              </p>
            )}
          </section>
        ) : null}

        {isRegistrationPatientsModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#101114] p-6 shadow-2xl max-h-[90vh] overflow-hidden">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Bemorlar bo&apos;yicha</h3>
                  <p className="text-xs text-white/50 mt-1">
                    Bir xil ism/familiya (va telefon) bo&apos;yicha registratsiyadagi buyurtmalar bitta kartada jamlanadi.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15"
                    onClick={() => void fetchRegistrationPatients()}
                    disabled={isRegistrationPatientsLoading}
                  >
                    {isRegistrationPatientsLoading ? "Yuklanmoqda..." : "Yangilash"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    onClick={() => setIsRegistrationPatientsModalOpen(false)}
                  >
                    Yopish
                  </button>
                </div>
              </div>

              {registrationPatientsData ? (
                <div className="mb-4 flex flex-wrap gap-4 text-sm text-white/75">
                  <p>
                    Bemorlar:{" "}
                    <strong className="text-teal-300">
                      {filteredRegistrationPatients.length}
                    </strong>
                  </p>
                  <p>
                    Tahlil qilingan buyurtmalar:{" "}
                    <strong className="text-teal-300">{registrationPatientsData.scannedOrders ?? 0}</strong>
                  </p>
                </div>
              ) : null}

              <div className="mb-4">
                <input
                  type="text"
                  className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/60"
                  placeholder="Ism Familiya bo'yicha filter"
                  value={registrationPatientsQuery}
                  onChange={(e) => setRegistrationPatientsQuery(e.target.value)}
                />
              </div>

              <div className="overflow-y-auto pr-1 max-h-[70vh]">
                {isRegistrationPatientsLoading && !registrationPatientsData ? (
                  <p className="text-sm text-white/55">Yuklanmoqda...</p>
                ) : null}
                {registrationPatientsData && Array.isArray(registrationPatientsData.patients) ? (
                  filteredRegistrationPatients.length === 0 ? (
                    <p className="text-sm text-white/55">Hozircha registratsiya bo&apos;yicha bemorlar topilmadi.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {filteredRegistrationPatients.map((patient) => (
                        <article
                          key={patient.groupKey}
                          className="rounded-xl border border-white/10 bg-black/25 p-4"
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() =>
                              setExpandedRegistrationPatients((prev) => ({
                                ...prev,
                                [patient.groupKey]: !prev[patient.groupKey]
                              }))
                            }
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-base font-semibold text-white">
                                  {[patient.patientFirstName, patient.patientLastName].filter(Boolean).join(" ") || "Noma&apos;lum"}
                                </p>
                                <p className="text-xs text-white/55">{patient.patientPhone || "Telefon yo&apos;q"}</p>
                                <button
                                  type="button"
                                  className="mt-2 rounded-md bg-teal-500 px-2.5 py-1 text-[11px] font-bold text-black hover:bg-teal-400 disabled:opacity-60"
                                  disabled={printingRegistrationPatientKey === patient.groupKey}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void printRegistrationPatientSummary(patient);
                                  }}
                                >
                                  {printingRegistrationPatientKey === patient.groupKey ? "..." : "Umumiy chek"}
                                </button>
                              </div>
                              <div className="text-right text-xs text-white/60">
                                <p>Tashrif: {patient.visitCount || 0}</p>
                                <p className="text-teal-300 font-semibold">
                                  {Number(patient.totalSpent || 0).toLocaleString("uz-UZ")} so&apos;m
                                </p>
                                <p className="text-white/50 mt-1">
                                  {expandedRegistrationPatients[patient.groupKey] ? "Yopish ▲" : "Pastga ochish ▼"}
                                </p>
                              </div>
                            </div>
                          </button>
                          {expandedRegistrationPatients[patient.groupKey] ? (
                            <div className="mt-3 space-y-1.5">
                              {(patient.visits || []).map((visit) => (
                                <div
                                  key={visit.ticketId || `${visit.createdAt}-${visit.queueCode}`}
                                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-white/90">
                                      {visit.service || "Xizmat"} ({visit.queueCode || "—"})
                                    </p>
                                    <p className="text-white/50">
                                      {formatReportDateTime(visit.createdAt, registrationPatientsData.timezone)}
                                    </p>
                                  </div>
                                  <p className="ml-3 whitespace-nowrap text-white/80">
                                    {Number(visit.price || 0).toLocaleString("uz-UZ")} so&apos;m
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activePage === PAGES.registrationDepartments ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Registratsiya bo'limlari</h2>
              <TapButton
                type="button"
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-teal-400"
                onClick={() => void saveRegistrationDepartments()}
              >
                Saqlash
              </TapButton>
            </div>
            <div className="space-y-2">
              {registrationDepartments.map((row, index) => (
                <div key={`${row.section || "dept"}-${index}`} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    className="bg-black/40 border border-white/10 rounded px-3 py-2"
                    placeholder="Bo'lim kodi"
                    value={row.section || ""}
                    onChange={(e) => {
                      const copy = [...registrationDepartments];
                      copy[index].section = e.target.value.toUpperCase();
                      setRegistrationDepartments(copy);
                    }}
                  />
                  <input
                    className="bg-black/40 border border-white/10 rounded px-3 py-2"
                    placeholder="Bo'lim nomi (ixtiyoriy)"
                    value={row.title || ""}
                    onChange={(e) => {
                      const copy = [...registrationDepartments];
                      copy[index].title = e.target.value;
                      setRegistrationDepartments(copy);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded bg-red-500/20 text-red-200 text-sm"
                    onClick={() => setRegistrationDepartments((prev) => prev.filter((_, i) => i !== index))}
                  >
                    O'chirish
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                placeholder="Yangi bo'lim kodi"
                value={newRegistrationDepartmentDraft.section}
                onChange={(e) =>
                  setNewRegistrationDepartmentDraft((p) => ({ ...p, section: e.target.value.toUpperCase() }))
                }
              />
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                placeholder="Yangi bo'lim nomi (ixtiyoriy)"
                value={newRegistrationDepartmentDraft.title}
                onChange={(e) => setNewRegistrationDepartmentDraft((p) => ({ ...p, title: e.target.value }))}
              />
              <button
                type="button"
                className="rounded bg-white/10 text-sm"
                onClick={addRegistrationDepartment}
              >
                + Bo'lim qo'shish
              </button>
            </div>
          </section>
        ) : null}

        {activePage === PAGES.registration ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6 space-y-8">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold text-white">Registratsiyalar</h2>
                <div className="flex flex-wrap gap-2">
                  <TapButton
                    type="button"
                    className="px-3 py-2 rounded bg-teal-500 text-black text-sm font-semibold hover:bg-teal-400"
                    onClick={() => void saveRegistrations()}
                  >
                    Saqlash
                  </TapButton>
                  <TapButton type="button" className="px-3 py-2 rounded bg-white/10 text-sm" onClick={openAddRegistrationModal}>
                    + Registratsiya qo'shish
                  </TapButton>
                </div>
              </div>
              <div className="space-y-3">
                {registrations.map((row, index) => (
                  <div key={`${row.id || "registratsiya"}-${index}`} className="rounded-lg border border-white/10 bg-black/25 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        className="bg-black/40 border border-white/10 rounded px-3 py-2"
                        placeholder="Registratsiya ID (ixtiyoriy)"
                        value={row.id || ""}
                        onChange={(e) => {
                          const copy = [...registrations];
                          copy[index].id = e.target.value;
                          setRegistrations(copy);
                        }}
                      />
                      <input
                        className="bg-black/40 border border-white/10 rounded px-3 py-2"
                        placeholder="Registratsiya nomi"
                        value={row.name || ""}
                        onChange={(e) => {
                          const copy = [...registrations];
                          copy[index].name = e.target.value;
                          setRegistrations(copy);
                        }}
                      />
                      <input
                        className="bg-black/40 border border-white/10 rounded px-3 py-2"
                        placeholder="Login"
                        value={row.login || ""}
                        onChange={(e) => {
                          const copy = [...registrations];
                          copy[index].login = e.target.value;
                          setRegistrations(copy);
                        }}
                      />
                      <input
                        className="bg-black/40 border border-white/10 rounded px-3 py-2"
                        placeholder="Parol"
                        value={row.password || ""}
                        onChange={(e) => {
                          const copy = [...registrations];
                          copy[index].password = e.target.value;
                          setRegistrations(copy);
                        }}
                      />
                      <label className="flex items-center gap-2 text-sm text-white/80">
                        <input
                          type="checkbox"
                          checked={row.enabled !== false}
                          onChange={(e) => {
                            const copy = [...registrations];
                            copy[index].enabled = e.target.checked;
                            setRegistrations(copy);
                          }}
                        />
                        Aktiv
                      </label>
                      <div className="md:col-span-2 flex justify-end pt-1">
                        <button
                          type="button"
                          className="rounded-lg border border-red-500/45 bg-red-500/15 px-4 py-2 text-sm text-red-100 hover:bg-red-500/25"
                          onClick={() => removeRegistrationAt(index)}
                        >
                          Registratsiyani o&apos;chirish
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </section>
        ) : null}

        {activePage === PAGES.registrationServices ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Registratsiya xizmatlari</h2>
              <TapButton
                type="button"
                className="px-3 py-2 rounded bg-white/10 text-sm"
                onClick={() => {
                  if (!registrationDepartments.length) {
                    window.alert("Avval «Registratsiya bo'limlari»da bo'lim qo'shing.");
                    return;
                  }
                  setIsRegistrationServiceModalOpen(true);
                }}
              >
                + Xizmat qo'shish
              </TapButton>
            </div>
            <div className="space-y-2">
              {registrationServices.map((row, index) => (
                <div key={`${row.id || "srv"}-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  <select
                    className="bg-black/40 border border-white/10 rounded px-3 py-2"
                    value={row.section || ""}
                    onChange={(e) => {
                      const copy = [...registrationServices];
                      copy[index].section = e.target.value.toUpperCase();
                      setRegistrationServices(copy);
                    }}
                  >
                    <option value="">Bo'limni tanlang...</option>
                    {registrationDepartments.map((d) => (
                      <option key={d.section} value={d.section}>
                        {d.section}
                        {d.title ? ` — ${d.title}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    className="bg-black/40 border border-white/10 rounded px-3 py-2"
                    placeholder="Xizmat nomi"
                    value={row.name || ""}
                    onChange={(e) => {
                      const copy = [...registrationServices];
                      copy[index].name = e.target.value;
                      setRegistrationServices(copy);
                    }}
                  />
                  <input
                    className="bg-black/40 border border-white/10 rounded px-3 py-2"
                    placeholder="Shifokor ismi"
                    value={row.doctorName || ""}
                    onChange={(e) => {
                      const copy = [...registrationServices];
                      copy[index].doctorName = e.target.value;
                      setRegistrationServices(copy);
                    }}
                  />
                  <input
                    className="bg-black/40 border border-white/10 rounded px-3 py-2"
                    type="number"
                    placeholder="Narx"
                    value={row.price || 0}
                    onChange={(e) => {
                      const copy = [...registrationServices];
                      copy[index].price = Number(e.target.value || 0);
                      setRegistrationServices(copy);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded bg-red-500/20 text-red-200 text-sm"
                    onClick={() => setRegistrationServices((prev) => prev.filter((_, i) => i !== index))}
                  >
                    O'chirish
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {isAddRegistrationModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#101114] p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Yangi registratsiya qo&apos;shish</h3>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
                  onClick={() => {
                    setIsAddRegistrationModalOpen(false);
                    setNewRegistrationDraft(emptyRegistrationDraft);
                  }}
                >
                  Yopish
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2 md:col-span-2"
                  placeholder="Registratsiya nomi"
                  value={newRegistrationDraft.name}
                  onChange={(e) => setNewRegistrationDraft((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  placeholder="Login"
                  value={newRegistrationDraft.login}
                  onChange={(e) => setNewRegistrationDraft((p) => ({ ...p, login: e.target.value }))}
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  placeholder="Parol"
                  value={newRegistrationDraft.password}
                  onChange={(e) => setNewRegistrationDraft((p) => ({ ...p, password: e.target.value }))}
                />
                <label className="flex items-center gap-2 text-sm text-white/80 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={newRegistrationDraft.enabled !== false}
                    onChange={(e) => setNewRegistrationDraft((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  Aktiv
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/75 hover:bg-white/10"
                  onClick={() => {
                    setIsAddRegistrationModalOpen(false);
                    setNewRegistrationDraft(emptyRegistrationDraft);
                  }}
                >
                  Bekor qilish
                </button>
                <TapButton
                  type="button"
                  className="rounded-lg bg-teal-500 px-5 py-2 text-sm font-bold text-black hover:bg-teal-400"
                  onClick={addRegistrationFromModal}
                >
                  Qo&apos;shish
                </TapButton>
              </div>
            </div>
          </div>
        ) : null}

        {isRegistrationServiceModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#101114] p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Registratsiya xizmati qo'shish</h3>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
                  onClick={() => setIsRegistrationServiceModalOpen(false)}
                >
                  Yopish
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <select
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={newRegistrationService.section}
                  onChange={(e) => setNewRegistrationService((p) => ({ ...p, section: e.target.value.toUpperCase() }))}
                >
                  <option value="">Bo'limni tanlang...</option>
                  {registrationDepartments.map((d) => (
                    <option key={d.section} value={d.section}>
                      {d.section}
                      {d.title ? ` — ${d.title}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  placeholder="Xizmat nomi"
                  value={newRegistrationService.name}
                  onChange={(e) => setNewRegistrationService((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  placeholder="Shifokor ismi"
                  value={newRegistrationService.doctorName}
                  onChange={(e) => setNewRegistrationService((p) => ({ ...p, doctorName: e.target.value }))}
                />
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2"
                  type="number"
                  placeholder="Narx"
                  value={newRegistrationService.price}
                  onChange={(e) => setNewRegistrationService((p) => ({ ...p, price: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/75 hover:bg-white/10"
                  onClick={() => setIsRegistrationServiceModalOpen(false)}
                >
                  Bekor qilish
                </button>
                <TapButton
                  type="button"
                  className="rounded-lg bg-teal-500 px-5 py-2 text-sm font-bold text-black hover:bg-teal-400"
                  onClick={addRegistrationServiceFromModal}
                >
                  Qo'shish
                </TapButton>
              </div>
            </div>
          </div>
        ) : null}

        {activePage === PAGES.settings ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-2">Sozlamalar</h2>
            <p className="text-sm text-white/60 mb-5">
              Atlas sync API o'chirildi. Bu bo'limda qo'shimcha sozlamalar keyin qo'shiladi.
            </p>
          </section>
        ) : null}

        {activePage === PAGES.control ? (
          <>
      <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold">Navbat nazorati</h2>
            <p className="text-xs text-white/50 mt-1 max-w-xl">
              Navbat raqamlari har kuni (
              <span className="text-teal-300/90">{queueSnapshot?.queueTimezone || "Asia/Tashkent"}</span>
              ) vaqti bo'yicha <strong className="text-white/70">avtomatik noldan</strong> boshlanadi. Quyida
              kutish, chaqirilganlar va bugun berilgan cheklar soni.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded bg-white/10 text-sm"
              onClick={() => fetchQueueSnapshot()}
            >
              Yangilash
            </button>
          </div>
        </div>

        {queueSnapshot?.queueDay ? (
          <p className="text-sm text-teal-200/90 mb-4 font-mono">
            Hisoblangan kun: <strong>{queueSnapshot.queueDay}</strong>
          </p>
        ) : (
          <p className="text-sm text-white/40 mb-4">Navbat ma'lumoti yuklanmoqda...</p>
        )}

        <div className="space-y-3">
          {queueSnapshot?.queues?.length === 0 ? (
            <p className="text-sm text-white/40 py-4">
              Xizmatlar yo'q — avval «Xizmatlar» sahifasida ro'yxatni saqlang.
            </p>
          ) : null}
          {(queueSnapshot?.queues || []).map((row) => (
            <div
              key={row.serviceId}
              className="rounded-lg border border-white/10 bg-black/25 p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4"
            >
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-white">{row.service}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-teal-500/15 text-teal-300">
                    Bo'lim {row.section}
                  </span>
                  {row.roomNumber ? (
                    <span className="text-xs text-white/50">Xona {row.roomNumber}</span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-white/40 uppercase tracking-wide">Kutayotganlar</p>
                    <p className="text-xl font-mono font-bold text-white">{row.waitingCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-white/40 uppercase tracking-wide">Bugun berilgan</p>
                    <p className="text-xl font-mono font-bold text-teal-300">{row.issuedToday ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-white/40 uppercase tracking-wide">Oxirgi raqam</p>
                    <p className="text-xl font-mono font-bold text-white/90">{row.lastNumber ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-white/40 uppercase tracking-wide">Keyingi navbat</p>
                    <p className="text-lg font-mono font-bold text-amber-200/90">
                      {queueLabel(row.next, row.section)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-white/60">
                  <span>
                    Hozir chaqirilgan:{" "}
                    <strong className="text-white font-mono">
                      {queueLabel(row.current, row.section)}
                    </strong>
                  </span>
                </div>
              </div>
              <div className="flex lg:flex-col gap-2 items-stretch justify-end">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-teal-500 text-black text-sm font-bold shrink-0"
                  onClick={() => callNextForService(row.serviceId)}
                >
                  Keyingi chaqirish
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

          </>
        ) : null}

        {activePage === PAGES.printer ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Printer</h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                value={printerTarget}
                onChange={(e) => setPrinterTarget(e.target.value)}
                placeholder="usb://... yoki ip"
              />
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                type="number"
                value={printerPort}
                onChange={(e) => setPrinterPort(Number(e.target.value))}
                placeholder="port"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button className="px-4 py-2 bg-teal-500 text-black rounded" onClick={savePrinter}>
                Printerni saqlash
              </button>
              <button
                className="px-4 py-2 bg-white/10 rounded disabled:opacity-50"
                disabled={isLoadingDevicePrinters}
                onClick={() => void loadDevicePrinters()}
              >
                {isLoadingDevicePrinters ? "Aniqlanmoqda..." : "Device printerlarni ko'rish"}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {printers.map((printer) => (
                <div
                  key={printer.queue}
                  className={`p-3 rounded border ${
                    selectedPrinterUri === printer.uri
                      ? "bg-teal-500/10 border-teal-400"
                      : "bg-black/30 border-white/10"
                  }`}
                >
                  <div className="font-semibold">{printer.queue}</div>
                  <div className="text-xs text-white/70 mb-3">{printer.uri}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectPrinter(printer)}
                      className="px-3 py-1 rounded bg-white/10 text-xs"
                    >
                      Tanlash
                    </button>
                    <button
                      onClick={() => savePrinterFromDevice(printer.uri)}
                      className="px-3 py-1 rounded bg-teal-500 text-black text-xs font-semibold"
                    >
                      Tanla va saqla
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activePage === PAGES.cashier ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-2">Kassa printeri</h2>
            <p className="text-sm text-white/65 mb-4">
              Kassa orqali &quot;Tasdiqlash va chek chiqarish&quot; bosilganda chek aynan shu manzilga yuboriladi
              (masalan <span className="text-white/90">windows://Printer nomi</span>). Bo&apos;sh qoldirsangiz, umumiy
              Printer sahifasidagi sozlama ishlatiladi.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-white/60 mb-1">Printer manzili</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2"
                  placeholder="windows://..."
                  value={cashierPrinterTarget}
                  onChange={(e) => setCashierPrinterTarget(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Port</label>
                <input
                  type="number"
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2"
                  value={cashierPrinterPort}
                  onChange={(e) => setCashierPrinterPort(Number(e.target.value) || 9100)}
                />
              </div>
            </div>
            <TapButton
              type="button"
              className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-black mb-8"
              onClick={() => void saveCashierPrinter()}
            >
              Kassa printerini saqlash
            </TapButton>
            <div className="mb-3">
              <TapButton
                type="button"
                className="rounded bg-white/10 px-4 py-2 text-sm"
                disabled={isLoadingDevicePrinters}
                onClick={() => void loadDevicePrinters()}
              >
                {isLoadingDevicePrinters ? "Aniqlanmoqda..." : "Device printerlarni ko'rish"}
              </TapButton>
            </div>
            {printers.length > 0 ? (
              <div className="mb-8 space-y-2">
                {printers.map((printer) => (
                  <div
                    key={`cashier-${printer.uri || printer.queue}`}
                    className={`p-3 rounded border ${
                      cashierPrinterTarget === printer.uri
                        ? "bg-teal-500/10 border-teal-400"
                        : "bg-black/30 border-white/10"
                    }`}
                  >
                    <div className="font-semibold">{printer.queue}</div>
                    <div className="text-xs text-white/70 mb-3">{printer.uri}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCashierPrinterTarget(printer.uri)}
                        className="px-3 py-1 rounded bg-white/10 text-xs"
                      >
                        Tanlash
                      </button>
                      <button
                        onClick={() => void saveCashierPrinterFromDevice(printer.uri)}
                        className="px-3 py-1 rounded bg-teal-500 text-black text-xs font-semibold"
                      >
                        Tanla va saqla
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mb-4 flex items-center justify-between gap-3 border-t border-white/10 pt-6">
              <h2 className="text-lg font-semibold text-white">Kassalar</h2>
              <div className="flex gap-2">
                <TapButton
                  type="button"
                  className="rounded bg-white/10 px-3 py-2 text-sm"
                  onClick={() =>
                    setCashiers((prev) => [
                      ...prev,
                      { id: "", name: "", login: "", password: "", enabled: true }
                    ])
                  }
                >
                  + Kassa qo'shish
                </TapButton>
                <TapButton
                  type="button"
                  className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-black"
                  onClick={() => void saveCashiers()}
                >
                  Saqlash
                </TapButton>
              </div>
            </div>
            <div className="space-y-3">
              {cashiers.map((row, index) => (
                <div key={`${row.id || "cashier"}-${index}`} className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      className="bg-black/40 border border-white/10 rounded px-3 py-2"
                      placeholder="Kassa ID"
                      value={row.id || ""}
                      onChange={(e) => {
                        const copy = [...cashiers];
                        copy[index].id = e.target.value;
                        setCashiers(copy);
                      }}
                    />
                    <input
                      className="bg-black/40 border border-white/10 rounded px-3 py-2"
                      placeholder="Ism"
                      value={row.name || ""}
                      onChange={(e) => {
                        const copy = [...cashiers];
                        copy[index].name = e.target.value;
                        setCashiers(copy);
                      }}
                    />
                    <input
                      className="bg-black/40 border border-white/10 rounded px-3 py-2"
                      placeholder="Login"
                      value={row.login || ""}
                      onChange={(e) => {
                        const copy = [...cashiers];
                        copy[index].login = e.target.value;
                        setCashiers(copy);
                      }}
                    />
                    <input
                      className="bg-black/40 border border-white/10 rounded px-3 py-2"
                      placeholder="Parol"
                      value={row.password || ""}
                      onChange={(e) => {
                        const copy = [...cashiers];
                        copy[index].password = e.target.value;
                        setCashiers(copy);
                      }}
                    />
                    <label className="flex items-center gap-2 text-sm text-white/80">
                      <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        onChange={(e) => {
                          const copy = [...cashiers];
                          copy[index].enabled = e.target.checked;
                          setCashiers(copy);
                        }}
                      />
                      Aktiv
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded border border-red-500/45 bg-red-500/15 px-4 py-2 text-sm text-red-100"
                      onClick={() => setCashiers((prev) => prev.filter((_, i) => i !== index))}
                    >
                      O'chirish
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {activePage === PAGES.cashierOrders ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-white/60">Tasdiqlovchi kassa</span>
                <select
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  value={cashierActorId}
                  onChange={(e) => setCashierActorId(e.target.value)}
                >
                  <option value="">Kassani tanlang</option>
                  {cashiers
                    .filter((c) => c.enabled !== false)
                    .map((c) => (
                      <option key={c.id || c.login} value={c.id || ""}>
                        {c.name || c.login || c.id}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block flex-1 min-w-[220px]">
                <span className="mb-1 block text-xs text-white/60">Bekor qilish sababi</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  placeholder="Masalan: bemor qaytdi"
                  value={pendingCancelReason}
                  onChange={(e) => setPendingCancelReason(e.target.value)}
                />
              </label>
              <TapButton
                type="button"
                className="rounded-lg bg-white/10 px-4 py-2 text-sm"
                onClick={() => {
                  void fetchCashierPendingOrders();
                  void fetchCashierAllOrders();
                }}
                disabled={isCashierPendingLoading}
              >
                {isCashierPendingLoading ? "Yuklanmoqda..." : "Yangilash"}
              </TapButton>
            </div>

            <div className="mb-4 text-sm text-white/70">
              Kutilayotgan guruhlar: <strong className="text-teal-300">{cashierPendingGroups.length}</strong>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Sana/Vaqt</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Bemor</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Telefon</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Xizmatlar</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Jami</th>
                    <th className="border-b border-white/10 px-3 py-2 text-right font-semibold">Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {cashierPendingGroups.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-white/55" colSpan={6}>
                        {isCashierPendingLoading ? "Yuklanmoqda..." : "Kutilayotgan buyurtma yo'q"}
                      </td>
                    </tr>
                  ) : (
                    cashierPendingGroups.map((group) => (
                      <tr key={group.key} className="odd:bg-black/20 even:bg-black/10">
                        <td className="border-b border-white/10 px-3 py-2">
                          {formatReportDateTime(group.createdAt, cashierReportsData?.timezone)}
                        </td>
                        <td className="border-b border-white/10 px-3 py-2">
                          {[group.patientFirstName, group.patientLastName].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="border-b border-white/10 px-3 py-2">{group.patientPhone || "—"}</td>
                        <td className="border-b border-white/10 px-3 py-2">
                          {group.lineItems.length <= 1 ? (
                            <span>{group.lineItems[0]?.service || "—"}</span>
                          ) : (
                            <details className="group">
                              <summary className="cursor-pointer text-teal-300 hover:text-teal-200">
                                {group.lineItems.length} ta xizmat
                              </summary>
                              <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/35 p-2">
                                {group.lineItems.map((item) => (
                                  <div key={item.ticketId} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-white/85">{item.service}</span>
                                    <span className="text-white/55">{Number(item.price || 0).toLocaleString("uz-UZ")} so'm</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </td>
                        <td className="border-b border-white/10 px-3 py-2 font-semibold text-teal-300">
                          {Number(group.total || 0).toLocaleString("uz-UZ")} so'm
                        </td>
                        <td className="border-b border-white/10 px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <TapButton
                              type="button"
                              className="rounded-md bg-teal-500 px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                              disabled={pendingActionKey === group.key}
                              onClick={() => void confirmCashierPendingGroup(group)}
                            >
                              {pendingActionKey === group.key ? "..." : "Tasdiqlash"}
                            </TapButton>
                            <TapButton
                              type="button"
                              className="rounded-md bg-red-500/20 px-2.5 py-1.5 text-xs font-bold text-red-100 disabled:opacity-50"
                              disabled={pendingActionKey === group.key}
                              onClick={() => void cancelCashierPendingGroup(group)}
                            >
                              Bekor
                            </TapButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Bekor qilingan buyurtmalar</h3>
                <span className="text-xs text-white/50">
                  {isCashierAllOrdersLoading ? "Yuklanmoqda..." : `${cashierCancelledRows.length} ta`}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Sana/Vaqt</th>
                      <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Bemor</th>
                      <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Kim bekor qildi</th>
                      <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Izoh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashierCancelledRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-white/55" colSpan={4}>
                          Bekor qilingan buyurtma yo'q
                        </td>
                      </tr>
                    ) : (
                      cashierCancelledRows.map((row) => (
                        <tr key={`cancelled-${row.ticketId}-${row.createdAt}`} className="odd:bg-black/20 even:bg-black/10">
                          <td className="border-b border-white/10 px-3 py-2">
                            {formatReportDateTime(row.cashierCancelledAt || row.createdAt, cashierAllOrdersData?.timezone)}
                          </td>
                          <td className="border-b border-white/10 px-3 py-2">
                            {[row.patientFirstName, row.patientLastName].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="border-b border-white/10 px-3 py-2">
                            {cashierNameById.get(String(row.cashierId || "").trim()) ||
                              String(row.cashierId || "").trim() ||
                              "Noma'lum"}
                          </td>
                          <td className="border-b border-white/10 px-3 py-2">{row.cashierCancelReason || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {activePage === PAGES.cashierReports ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-300/80">Filterlar</p>
              <p className="mb-4 text-xs text-white/50">Sana, bo'lim va bemor bo'yicha hisobotni aniq kesimda ko'ring.</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-white/75">Aniq sana</span>
                  <input
                    type="date"
                    className="w-full min-h-[48px] rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20"
                    value={cashierReportExactDate}
                    onChange={(e) => setCashierReportExactDate(e.target.value)}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-white/75">Boshlanish sanasi</span>
                  <input
                    type="date"
                    className="w-full min-h-[48px] rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20"
                    value={cashierReportFromDate}
                    onChange={(e) => setCashierReportFromDate(e.target.value)}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-white/75">Tugash sanasi</span>
                  <input
                    type="date"
                    className="w-full min-h-[48px] rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20"
                    value={cashierReportToDate}
                    onChange={(e) => setCashierReportToDate(e.target.value)}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-white/75">Bo'lim</span>
                  <select
                    className="w-full min-h-[48px] rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20"
                    value={cashierReportSection}
                    onChange={(e) => setCashierReportSection(e.target.value)}
                  >
                    <option value="">Barcha bo'limlar</option>
                    {cashierReportSections.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block md:col-span-4">
                  <span className="mb-1.5 block text-xs font-medium text-white/75">Bemor qidiruvi (ism/familiya)</span>
                  <input
                    className="w-full min-h-[48px] rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-teal-400/60 focus:ring-2 focus:ring-teal-500/20"
                    placeholder="Masalan: Ali Valiyev"
                    value={cashierReportPatientQuery}
                    onChange={(e) => setCashierReportPatientQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <TapButton
                  type="button"
                  className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black shadow-sm shadow-teal-900/30"
                  onClick={cashierFilterApplied ? resetCashierReportFilters : applyCashierReportFilters}
                >
                  {cashierFilterApplied ? "Tozalash" : "Filterlash"}
                </TapButton>
                <TapButton
                  type="button"
                  className="rounded-xl border border-white/15 bg-white/10 px-5 py-2.5 text-sm text-white/90"
                  onClick={() => void fetchCashierReportsLog()}
                  disabled={isCashierReportsLoading}
                >
                  Yangilash
                </TapButton>
              </div>
            </div>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="text-sm text-white/70">
                Natija: <strong className="text-teal-300">{cashierReportGroupedRows.length}</strong>
                <span className="ml-2 text-white/45">(xizmatlar: {cashierReportRows.length})</span>
              </div>
              <div className="text-xs text-white/45">Filtrlangan ma'lumotlar asosida ko'rsatildi</div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Jami tushum</p>
                <p className="mt-1 text-2xl font-extrabold text-teal-300">
                  {Number(cashierReportDashboard.totalRevenue || 0).toLocaleString("uz-UZ")} so'm
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Cheklar soni</p>
                <p className="mt-1 text-2xl font-extrabold text-white">
                  {Number(cashierReportDashboard.totalChecks || 0).toLocaleString("uz-UZ")}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">O'rtacha chek</p>
                <p className="mt-1 text-2xl font-extrabold text-teal-300">
                  {Number(cashierReportDashboard.avgCheck || 0).toLocaleString("uz-UZ")} so'm
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Faol bo'limlar</p>
                <p className="mt-1 text-2xl font-extrabold text-white">
                  {Number(cashierReportDashboard.topDepartments.length || 0)}
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h3 className="text-sm font-bold text-white mb-3">Bo'limlar bo'yicha tushum</h3>
                <div className="space-y-2">
                  {cashierReportDashboard.topDepartments.length === 0 ? (
                    <p className="text-sm text-white/45">Ma'lumot yo'q</p>
                  ) : (
                    cashierReportDashboard.topDepartments.map((row) => {
                      const pct = cashierReportDashboard.maxDepartmentRevenue > 0
                        ? Math.max(4, Math.round((Number(row.revenue || 0) / cashierReportDashboard.maxDepartmentRevenue) * 100))
                        : 0;
                      return (
                        <div key={row.label} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-white/85">{row.label}</span>
                            <span className="font-bold text-teal-300">{Number(row.revenue || 0).toLocaleString("uz-UZ")} so'm</span>
                          </div>
                          <div className="h-2 rounded bg-white/10 overflow-hidden">
                            <div className="h-full rounded bg-teal-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h3 className="text-sm font-bold text-white mb-3">Xizmatlar TOP (tushum)</h3>
                <div className="space-y-2">
                  {cashierReportDashboard.topServices.length === 0 ? (
                    <p className="text-sm text-white/45">Ma'lumot yo'q</p>
                  ) : (
                    cashierReportDashboard.topServices.map((row) => {
                      const pct = cashierReportDashboard.maxServiceRevenue > 0
                        ? Math.max(4, Math.round((Number(row.revenue || 0) / cashierReportDashboard.maxServiceRevenue) * 100))
                        : 0;
                      return (
                        <div key={row.label} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-white/85">{row.label}</span>
                            <span className="font-bold text-teal-300">{Number(row.revenue || 0).toLocaleString("uz-UZ")} so'm</span>
                          </div>
                          <div className="h-2 rounded bg-white/10 overflow-hidden">
                            <div className="h-full rounded bg-teal-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="mr-auto">
                  <h3 className="text-sm font-bold text-white">Kunlik trend</h3>
                  <p className="text-xs text-white/50">Aniq kun yoki sana oralig'i bo'yicha tushumni ko'rish</p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-white/65">Aniq sana</span>
                  <input
                    type="date"
                    className="min-h-[40px] rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-xs text-white outline-none focus:border-teal-400/60"
                    value={cashierTrendExactDate}
                    onChange={(e) => setCashierTrendExactDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-white/65">Dan</span>
                  <input
                    type="date"
                    className="min-h-[40px] rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-xs text-white outline-none focus:border-teal-400/60"
                    value={cashierTrendFromDate}
                    onChange={(e) => setCashierTrendFromDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-white/65">Gacha</span>
                  <input
                    type="date"
                    className="min-h-[40px] rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-xs text-white outline-none focus:border-teal-400/60"
                    value={cashierTrendToDate}
                    onChange={(e) => setCashierTrendToDate(e.target.value)}
                  />
                </label>
                <TapButton
                  type="button"
                  className="min-h-[40px] rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/90"
                  onClick={() => {
                    setCashierTrendExactDate("");
                    setCashierTrendFromDate("");
                    setCashierTrendToDate("");
                  }}
                >
                  Tozalash
                </TapButton>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                {cashierTrendItems.length === 0 ? (
                  <p className="text-sm text-white/45">Ma'lumot yo'q</p>
                ) : (
                  cashierTrendItems.map((day) => (
                    <div key={day.day} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                      <p className="m-0 text-xs text-white/60">{day.day.slice(5)}</p>
                      <div className="mt-2 h-20 rounded bg-white/5 p-1.5">
                        <div
                          className="h-full w-full rounded bg-teal-400/20 flex items-end"
                        >
                          <div
                            className="w-full rounded bg-teal-400"
                            style={{
                              height: `${
                                cashierTrendMaxRevenue > 0
                                  ? Math.max(8, Math.round((Number(day.totalRevenue || 0) / cashierTrendMaxRevenue) * 100))
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                      </div>
                      <p className="m-0 mt-2 text-sm font-bold text-teal-300">
                        {Number(day.totalRevenue || 0).toLocaleString("uz-UZ")} so'm
                      </p>
                      <p className="m-0 text-[11px] text-white/45">{day.count} ta chek</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Sana/Vaqt</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Bemor</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Telefon</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Bo'lim</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold whitespace-nowrap">
                      To&apos;lov turi
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Xizmatlar</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">Narx</th>
                    <th className="border-b border-white/10 px-3 py-2 text-right font-semibold">Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {cashierReportGroupedRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-white/55" colSpan={8}>
                        {isCashierReportsLoading ? "Yuklanmoqda..." : "Filter bo'yicha ma'lumot yo'q"}
                      </td>
                    </tr>
                  ) : (
                    cashierReportGroupedRows.map((group, idx) => (
                      <tr key={`${group.groupKey}-${idx}`} className="odd:bg-black/20 even:bg-black/10">
                        <td className="border-b border-white/10 px-3 py-2">{formatReportDateTime(group.createdAt, cashierReportsData?.timezone)}</td>
                        <td className="border-b border-white/10 px-3 py-2">
                          {group.patientName}
                        </td>
                        <td className="border-b border-white/10 px-3 py-2">{group.patientPhone}</td>
                        <td className="border-b border-white/10 px-3 py-2">{group.departmentsLabel || "—"}</td>
                        <td className="border-b border-white/10 px-3 py-2 whitespace-nowrap">
                          {group.paymentMethodLabel}
                        </td>
                        <td className="border-b border-white/10 px-3 py-2">
                          {group.services.length <= 1 ? (
                            <span>{group.services[0]?.service || "—"}</span>
                          ) : (
                            <details className="group">
                              <summary className="cursor-pointer text-teal-300 hover:text-teal-200">
                                {group.services.length} ta xizmat
                              </summary>
                              <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/35 p-2">
                                {group.services.map((svc) => (
                                  <div key={svc.ticketId || `${svc.service}-${svc.department}`} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-white/85">{svc.service}</span>
                                    <span className="text-white/55">{Number(svc.price || 0).toLocaleString("uz-UZ")} so'm</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </td>
                        <td className="border-b border-white/10 px-3 py-2 text-teal-300 font-semibold">
                          {Number(group.totalPrice || 0).toLocaleString("uz-UZ")} so'm
                        </td>
                        <td className="border-b border-white/10 px-3 py-2 text-right">
                          <TapButton
                            type="button"
                            className="rounded-lg border border-teal-400/35 bg-teal-500/15 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/25"
                            onClick={() => void reprintCashierReceipt(group)}
                            disabled={printingOrderTicketId === (group.services?.[0]?.ticketId || "")}
                          >
                            {printingOrderTicketId === (group.services?.[0]?.ticketId || "") ? "..." : "Qayta chek"}
                          </TapButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
