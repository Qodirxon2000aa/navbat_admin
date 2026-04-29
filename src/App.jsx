import { useEffect, useState } from "react";

const RAW_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const API_URL = `${RAW_API_URL.replace(/\/$/, "")}/admin`;

const emptyService = { id: "", name: "", section: "", price: 0 };

export default function App() {
  const [services, setServices] = useState([]);
  const [printerTarget, setPrinterTarget] = useState("");
  const [printerPort, setPrinterPort] = useState(9100);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinterUri, setSelectedPrinterUri] = useState("");
  const [newService, setNewService] = useState(emptyService);
  const [message, setMessage] = useState("");

  const isZbPrinter = (value) => String(value || "").toLowerCase().includes("zb");

  const fetchConfig = async () => {
    const response = await fetch(`${API_URL}/config`);
    const data = await response.json();
    setServices(data.services || []);
    setPrinterTarget(data.printerTarget || "");
    setPrinterPort(data.printerPort || 9100);
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const saveServices = async () => {
    try {
      const payload = services.map((service) => ({
        id: String(service.id || "").trim(),
        name: String(service.name || "").trim(),
        section: String(service.section || "").trim().toUpperCase(),
        price: Number(service.price || 0)
      }));

      const hasInvalid = payload.some(
        (service) => !service.id || !service.name || !service.section || Number.isNaN(service.price)
      );
      if (hasInvalid) {
        window.alert("Xizmat maydonlarini to'liq to'ldiring (id, nomi, bo'lim, narx).");
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
    const normalized = {
      id: String(newService.id || "").trim(),
      name: String(newService.name || "").trim(),
      section: String(newService.section || "").trim().toUpperCase(),
      price: Number(newService.price || 0)
    };

    if (!normalized.id || !normalized.name || !normalized.section || Number.isNaN(normalized.price)) {
      window.alert("Yangi xizmat uchun barcha maydonlarni to'ldiring.");
      return;
    }

    const duplicated = services.some(
      (service) => String(service.id || "").trim().toLowerCase() === normalized.id.toLowerCase()
    );
    if (duplicated) {
      window.alert("Bu ID bilan xizmat allaqachon mavjud.");
      return;
    }

    setServices([...services, normalized]);
    setNewService({ ...emptyService });
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

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
      {message ? <p className="mb-4 text-teal-300">{message}</p> : null}

      <section className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Xizmatlar</h2>
        <div className="space-y-3">
          {services.map((service, index) => (
            <div key={service.id + index} className="grid grid-cols-4 gap-3">
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                value={service.id}
                onChange={(e) => {
                  const copy = [...services];
                  copy[index].id = e.target.value;
                  setServices(copy);
                }}
                placeholder="id"
              />
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                value={service.name}
                onChange={(e) => {
                  const copy = [...services];
                  copy[index].name = e.target.value;
                  setServices(copy);
                }}
                placeholder="nomi"
              />
              <input
                className="bg-black/40 border border-white/10 rounded px-3 py-2"
                value={service.section}
                onChange={(e) => {
                  const copy = [...services];
                  copy[index].section = e.target.value;
                  setServices(copy);
                }}
                placeholder="bo'lim (A)"
              />
              <div className="flex gap-2">
                <input
                  className="bg-black/40 border border-white/10 rounded px-3 py-2 w-full"
                  type="number"
                  value={service.price}
                  onChange={(e) => {
                    const copy = [...services];
                    copy[index].price = Number(e.target.value);
                    setServices(copy);
                  }}
                  placeholder="narx"
                />
                <button
                  className="px-3 bg-red-500/20 rounded"
                  onClick={() => setServices(services.filter((_, i) => i !== index))}
                >
                  O'chir
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          <input
            className="bg-black/40 border border-white/10 rounded px-3 py-2"
            value={newService.id}
            onChange={(e) => setNewService({ ...newService, id: e.target.value })}
            placeholder="yangi id"
          />
          <input
            className="bg-black/40 border border-white/10 rounded px-3 py-2"
            value={newService.name}
            onChange={(e) => setNewService({ ...newService, name: e.target.value })}
            placeholder="yangi nom"
          />
          <input
            className="bg-black/40 border border-white/10 rounded px-3 py-2"
            value={newService.section}
            onChange={(e) => setNewService({ ...newService, section: e.target.value })}
            placeholder="bo'lim"
          />
          <div className="flex gap-2">
            <input
              className="bg-black/40 border border-white/10 rounded px-3 py-2 w-full"
              type="number"
              value={newService.price}
              onChange={(e) => setNewService({ ...newService, price: Number(e.target.value) })}
              placeholder="narx"
            />
            <button
              className="px-3 bg-teal-500 text-black rounded"
              onClick={addService}
            >
              Qo'sh
            </button>
          </div>
        </div>

        <button className="mt-4 px-4 py-2 bg-teal-500 text-black rounded" onClick={saveServices}>
          Xizmatlarni saqlash
        </button>
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
    </div>
  );
}
