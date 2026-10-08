"use client";
import { useEffect, useState } from "react";
import { useEventSubscription } from "@/lib/app-store";
import { Button } from "./ui";

export function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => { setPermission("Notification" in window ? Notification.permission : "unsupported"); }, []);
  return <section className="panel settings-panel"><h2>Уведомления</h2>
    <p>Сообщения и сигналы хозяйства, пока EGIN открыт в браузере. Доставка при закрытом приложении пока не подключена.</p>
    {permission === "default" ? <Button onClick={async () => { setPermission(await Notification.requestPermission()); }}>Разрешить уведомления</Button>
      : <p className="note">{permission === "granted" ? "Уведомления разрешены. Вы можете изменить это в настройках сайта браузера." : permission === "denied" ? "Уведомления отключены в браузере. Включить их можно в настройках сайта." : "Этот браузер не поддерживает уведомления. Сообщения доступны внутри EGIN."}</p>}
  </section>;
}

export function RealtimeNotifications() {
  useEventSubscription(event => {
    if (event.type !== "notification.created" || document.visibilityState !== "hidden" || !("Notification" in window) || Notification.permission !== "granted") return;
    const title = String(event.payload.title || "Новое уведомление EGIN");
    const options = { body: "Откройте EGIN, чтобы посмотреть подробности.", tag: "egin-" + event.entityId, icon: "/icon-192.png", data: { url: "/more" } };
    if ("serviceWorker" in navigator) void navigator.serviceWorker.ready.then(registration => registration.showNotification(title, options)).catch(() => {});
    else new Notification(title, options);
  });
  return null;
}
