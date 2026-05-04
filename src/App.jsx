import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveDoctorPhotoUrl } from "./utils/resolveDoctorPhotoUrl.js";

const RAW_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const API_URL = `${RAW_API_URL.replace(/\/$/, "")}/admin`;
const PUBLIC_API_URL = RAW_API_URL.replace(/\/$/, "");

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
  reports: "reports",
  orders: "orders",
  patients: "patients",
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
const IconPatients = () => (
  <NavIcon>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </NavIcon>
);
const IconReports = () => (
  <NavIcon>
    <path d="M3 3v18h18" />
    <path d="M7 16l4-4 4 4 5-7" />
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

export default function App() {
  const [activePage, setActivePage] = useState(PAGES.control);
  const [services, setServices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newService, setNewService] = useState(emptyService);
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [newDepartment, setNewDepartment] = useState(emptyDepartment);
  const [queueSnapshot, setQueueSnapshot] = useState(null);
  const [printerTarget, setPrinterTarget] = useState("");
  const [printerPort, setPrinterPort] = useState(9100);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinterUri, setSelectedPrinterUri] = useState("");
  const [message, setMessage] = useState("");
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportData, setReportData] = useState(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [ordersLogData, setOrdersLogData] = useState(null);
  const [isOrdersLogLoading, setIsOrdersLogLoading] = useState(false);
  const [ordersLogLimit, setOrdersLogLimit] = useState(12000);
  const [printingOrderTicketId, setPrintingOrderTicketId] = useState(null);
  const [patientsData, setPatientsData] = useState(null);
  const [isPatientsLoading, setIsPatientsLoading] = useState(false);
  const [patientsScanLimit, setPatientsScanLimit] = useState(20000);
  const [expandedPatientKey, setExpandedPatientKey] = useState(null);
  const [patientsFilterFirstName, setPatientsFilterFirstName] = useState("");
  const [patientsFilterLastName, setPatientsFilterLastName] = useState("");
  const [isSyncingAtlas, setIsSyncingAtlas] = useState(false);

  const isZbPrinter = (value) => String(value || "").toLowerCase().includes("zb");

  const fetchConfig = async () => {
    const response = await fetch(`${API_URL}/config`, { cache: "no-store" });
    const data = await response.json();
    setServices(data.services || []);
    setDepartments(data.departments || []);
    setPrinterTarget(data.printerTarget || "");
    setPrinterPort(data.printerPort || 9100);
  };

  useEffect(() => {
    fetchConfig();
  }, []);

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

  const fetchPatients = useCallback(async () => {
    setIsPatientsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/patients?limit=${encodeURIComponent(patientsScanLimit)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || "Bemorlar ro'yxatini olishda xatolik");
        return;
      }
      setPatientsData(data);
    } catch (_error) {
      window.alert("Bemorlar: server bilan aloqa xatoligi");
    } finally {
      setIsPatientsLoading(false);
    }
  }, [patientsScanLimit]);

  const fetchPatientsRef = useRef(fetchPatients);
  fetchPatientsRef.current = fetchPatients;

  const patientsFiltered = useMemo(() => {
    const list = patientsData?.patients || [];
    const qFn = String(patientsFilterFirstName || "").trim().toLowerCase();
    const qLn = String(patientsFilterLastName || "").trim().toLowerCase();
    if (!qFn && !qLn) return list;
    return list.filter((p) => {
      const fn = String(p.patientFirstName || "").toLowerCase();
      const ln = String(p.patientLastName || "").toLowerCase();
      if (qFn && !fn.includes(qFn)) return false;
      if (qLn && !ln.includes(qLn)) return false;
      return true;
    });
  }, [patientsData, patientsFilterFirstName, patientsFilterLastName]);

  useEffect(() => {
    if (!expandedPatientKey) return undefined;
    if (!patientsFiltered.some((p) => p.groupKey === expandedPatientKey)) {
      setExpandedPatientKey(null);
    }
    return undefined;
  }, [patientsFiltered, expandedPatientKey]);

  useEffect(() => {
    if (activePage !== PAGES.orders) return undefined;
    void fetchOrdersLog();
    return undefined;
  }, [activePage, ordersLogLimit, fetchOrdersLog]);

  useEffect(() => {
    if (activePage !== PAGES.patients) return undefined;
    void fetchPatients();
    return undefined;
  }, [activePage, patientsScanLimit, fetchPatients]);

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
      if (activePage === PAGES.patients) {
        void fetchPatientsRef.current();
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
    const response = await fetch(`${API_URL}/printers`);
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Printerlarni olishda xatolik");
      return;
    }
    const list = data.printers || [];
    setPrinters(list);
    const selected = list.find((item) => item.uri === printerTarget);
    setSelectedPrinterUri(selected ? selected.uri : "");
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

  const syncAtlasFromSettings = async () => {
    setIsSyncingAtlas(true);
    try {
      const response = await fetch(`${API_URL}/sync-atlas`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || "Atlas sync bajarilmadi");
        return;
      }
      window.alert(data.message || "Atlas sync muvaffaqiyatli bajarildi");
    } catch (_error) {
      window.alert("Server bilan aloqa yo'q");
    } finally {
      setIsSyncingAtlas(false);
    }
  };

  const navBtn = (id, label, Icon) => (
    <button
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
    </button>
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
          {navBtn(PAGES.control, "Boshqaruv", IconControl)}
          {navBtn(PAGES.orders, "Buyurtmalar", IconOrders)}
          {navBtn(PAGES.patients, "Bemorlar", IconPatients)}
          {navBtn(PAGES.reports, "Hisobot", IconReports)}
          {navBtn(PAGES.departments, "Bo'limlar", IconDepartments)}
          {navBtn(PAGES.services, "Xizmatlar", IconServices)}
          {navBtn(PAGES.settings, "Sozlamalar", IconSettings)}
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5 md:p-8 max-w-5xl w-full mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
          {activePage === PAGES.services
            ? "Xizmatlar"
            : activePage === PAGES.departments
              ? "Bo'limlar"
              : activePage === PAGES.reports
                ? "Hisobot"
                : activePage === PAGES.orders
                  ? "Buyurtmalar"
                  : activePage === PAGES.patients
                    ? "Bemorlar"
                    : activePage === PAGES.settings
                    ? "Sozlamalar"
                    : "Boshqaruv"}
        </h1>
        <p className="text-xs text-white/45 mb-6">
          {activePage === PAGES.services
            ? "Bo'limlar jadvali: xona va narxni tahrirlang yoki modal orqali yangi xizmat qo'shing."
            : activePage === PAGES.departments
              ? "Har klinika bo'limi uchun shifokor shabloni. Keyin xizmat qo'shishda shu bo'limni tanlasangiz, maydonlar o'zi to'ldiriladi."
              : activePage === PAGES.reports
                ? "Ikki sana oralig'ida bo'limlar bo'yicha yig'ma va har bir berilgan chek: bemor, telefon, sana va soat."
                : activePage === PAGES.orders
                  ? "Barcha berilgan navbat cheklari: sana va soat, bemor, telefon, bo'lim, xizmat, narx. Yangi chek qo'shilganda ro'yxat avtomatik yangilanadi."
                  : activePage === PAGES.patients
                    ? "Telefon yoki ism-familiya bo‘yicha guruhlangan bemorlar: ustiga bosing — bo‘lim, xizmat, sana va shifokor bo‘yicha barcha tashriflar."
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

                <h3 className="mt-10 text-base font-bold text-white">Berilgan cheklar (bemorlar)</h3>
                <p className="text-xs text-white/45 mb-3">
                  Ro&apos;yxat: navbat olingan vaqt (
                  {reportData?.timezone || "Asia/Tashkent"}) bo&apos;yicha. Eski cheklarda bemor maydonlari bo&apos;sh
                  bo&apos;lishi mumkin.
                </p>
                <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Sana va soat
                        </th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Ism</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Familiya</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Telefon
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
                            colSpan={9}
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
                            <td className="border-b border-white/10 px-3 py-2.5 text-white">
                              {row.patientFirstName || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white">
                              {row.patientLastName || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono text-xs text-teal-200/90 whitespace-nowrap">
                              {row.patientPhone || "—"}
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
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Ism</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold">Familiya</th>
                        <th className="border-b border-white/10 px-3 py-3 text-left font-semibold whitespace-nowrap">
                          Telefon
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
                            colSpan={10}
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
                            <td className="border-b border-white/10 px-3 py-2.5 text-white">
                              {row.patientFirstName || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 text-white">
                              {row.patientLastName || "—"}
                            </td>
                            <td className="border-b border-white/10 px-3 py-2.5 font-mono text-xs text-teal-200/90 whitespace-nowrap">
                              {row.patientPhone || "—"}
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

        {activePage === PAGES.patients ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <div className="flex flex-wrap items-end gap-3 mb-5">
              <label className="text-xs text-white/60 block">
                Cheklardan skaner (so&apos;nggi)
                <select
                  className="mt-1 block rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white text-sm"
                  value={patientsScanLimit}
                  onChange={(e) => setPatientsScanLimit(Number(e.target.value) || 8000)}
                >
                  <option value={8000}>8 000</option>
                  <option value={12000}>12 000</option>
                  <option value={20000}>20 000</option>
                  <option value={50000}>50 000</option>
                </select>
              </label>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-teal-500 text-black font-bold text-sm"
                onClick={() => void fetchPatients()}
                disabled={isPatientsLoading}
              >
                {isPatientsLoading ? "Yuklanmoqda..." : "Yangilash"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 w-full max-w-xl">
              <label className="text-xs text-white/60 block">
                Filtr: ism
                <input
                  type="search"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white text-sm outline-none focus:border-teal-400/50"
                  placeholder="Qisman yozing…"
                  value={patientsFilterFirstName}
                  onChange={(e) => setPatientsFilterFirstName(e.target.value)}
                />
              </label>
              <label className="text-xs text-white/60 block">
                Filtr: familiya
                <input
                  type="search"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white text-sm outline-none focus:border-teal-400/50"
                  placeholder="Qisman yozing…"
                  value={patientsFilterLastName}
                  onChange={(e) => setPatientsFilterLastName(e.target.value)}
                />
              </label>
            </div>

            {patientsData ? (
              <>
                <div className="text-sm text-white/80 flex flex-wrap gap-4 mb-4">
                  <p>
                    Bemorlar (guruh):{" "}
                    <strong className="text-teal-300">{patientsData.patients?.length ?? 0}</strong>
                  </p>
                  {patientsFilterFirstName.trim() || patientsFilterLastName.trim() ? (
                    <p>
                      Filtr natijasi:{" "}
                      <strong className="text-teal-300">{patientsFiltered.length}</strong>
                    </p>
                  ) : null}
                  <p>
                    Skanerlangan cheklar:{" "}
                    <strong className="text-teal-300">{patientsData.scannedOrders ?? 0}</strong>
                  </p>
                  {patientsData.truncated ? (
                    <p className="text-amber-200/90">Bazada yana cheklar bor — limitni oshiring.</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {(patientsData.patients || []).length === 0 ? (
                    <p className="text-sm text-white/45 py-6 text-center">Hozircha bemor (chek bilan) topilmadi.</p>
                  ) : patientsFiltered.length === 0 ? (
                    <p className="text-sm text-amber-200/90 py-6 text-center">
                      Filtrga mos bemor topilmadi — ism yoki familiyani o&apos;zgartiring.
                    </p>
                  ) : (
                    patientsFiltered.map((p) => {
                      const open = expandedPatientKey === p.groupKey;
                      const name = [p.patientFirstName, p.patientLastName].filter(Boolean).join(" ").trim();
                      return (
                        <div
                          key={p.groupKey}
                          className="rounded-xl border border-white/10 bg-black/25 overflow-hidden"
                        >
                          <button
                            type="button"
                            className="w-full flex flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition"
                            onClick={() =>
                              setExpandedPatientKey((k) => (k === p.groupKey ? null : p.groupKey))
                            }
                          >
                            <div className="flex-1 min-w-[12rem]">
                              <div className="text-base font-bold text-white">{name || "Ismsiz bemor"}</div>
                              <div className="text-sm font-mono text-teal-200/85">{p.patientPhone || "—"}</div>
                            </div>
                            <div className="text-right text-sm text-white/80">
                              <div>
                                <span className="text-white/45">Tashriflar:</span>{" "}
                                <strong className="text-white">{p.visitCount}</strong>
                              </div>
                              <div className="text-teal-300 font-semibold tabular-nums">
                                {Number(p.totalSpent || 0).toLocaleString("uz-UZ")} so&apos;m
                              </div>
                            </div>
                            <span className="text-white/45 text-lg w-8 text-center shrink-0">{open ? "▲" : "▼"}</span>
                          </button>

                          {open ? (
                            <div className="border-t border-white/10 bg-black/35 px-3 pb-4 pt-3">
                              <p className="text-xs text-white/50 mb-3 m-0">
                                Birinchi tashrif:{" "}
                                <span className="text-white/80 font-mono">
                                  {formatReportDateTime(p.firstVisitAt, patientsData.timezone)}
                                </span>
                                {" · "}
                                Oxirgi:{" "}
                                <span className="text-white/80 font-mono">
                                  {formatReportDateTime(p.lastVisitAt, patientsData.timezone)}
                                </span>
                              </p>
                              <div className="overflow-x-auto rounded-lg border border-white/10">
                                <table className="min-w-full border-collapse text-sm">
                                  <thead className="bg-white/5 text-white/65">
                                    <tr>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                                        Sana va soat
                                      </th>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                                        Navbat
                                      </th>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-left font-semibold">
                                        Bo&apos;lim
                                      </th>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-left font-semibold">
                                        Xizmat
                                      </th>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-left font-semibold">
                                        Shifokor
                                      </th>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                                        Xona
                                      </th>
                                      <th className="border-b border-white/10 px-3 py-2.5 text-right font-semibold">
                                        Narx
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(p.visits || []).map((v) => (
                                      <tr key={v.ticketId} className="odd:bg-black/15 even:bg-black/10">
                                        <td className="border-b border-white/10 px-3 py-2 font-mono text-xs whitespace-nowrap text-white/90">
                                          {formatReportDateTime(v.createdAt, patientsData.timezone)}
                                        </td>
                                        <td className="border-b border-white/10 px-3 py-2 font-mono font-bold text-teal-300 whitespace-nowrap">
                                          {v.queueCode || "—"}
                                        </td>
                                        <td className="border-b border-white/10 px-3 py-2 text-white/85">
                                          {v.section || "—"}
                                        </td>
                                        <td className="border-b border-white/10 px-3 py-2 text-white/80">
                                          {v.service || "—"}
                                        </td>
                                        <td className="border-b border-white/10 px-3 py-2 text-white/80">
                                          {[v.doctorFirstName, v.doctorLastName].filter(Boolean).join(" ") || "—"}
                                        </td>
                                        <td className="border-b border-white/10 px-3 py-2 text-white/70 whitespace-nowrap">
                                          {v.roomNumber || "—"}
                                        </td>
                                        <td className="border-b border-white/10 px-3 py-2 text-right whitespace-nowrap text-white/90">
                                          {Number(v.price || 0).toLocaleString("uz-UZ")} so&apos;m
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-white/45">{isPatientsLoading ? "Yuklanmoqda..." : "Ma'lumot yo'q."}</p>
            )}
          </section>
        ) : null}

        {activePage === PAGES.settings ? (
          <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-2">Atlas sync</h2>
            <p className="text-sm text-white/60 mb-5">
              Internet mavjud bo'lsa, Compass (lokal MongoDB) dagi joriy holat Atlas bazaga yuboriladi.
            </p>
            <button
              type="button"
              onClick={syncAtlasFromSettings}
              disabled={isSyncingAtlas}
              className="px-5 py-2.5 rounded bg-teal-500 text-black font-bold text-sm disabled:opacity-60"
            >
              {isSyncingAtlas ? "Sync qilinmoqda..." : "Sync qilish"}
            </button>
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
          <button className="px-4 py-2 bg-white/10 rounded" onClick={loadDevicePrinters}>
            Device printerlarni ko'rish
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
          </>
        ) : null}
      </main>
    </div>
  );
}
