"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "../lib/actions";

export type Invoke = (formData: FormData) => Promise<ActionResult>;

/** Form wrapper: pending state, toast (role=status), reset-on-success (C-2). */
export function ActionForm({
  invoke,
  children,
  style,
  onDone,
}: {
  invoke: Invoke;
  children: (pending: boolean) => React.ReactNode;
  style?: React.CSSProperties;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionResult | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(t);
  }, [status]);
  return (
    <form
      ref={ref}
      style={style ?? { display: "inline" }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const r = await invoke(fd);
          setStatus(r);
          if (r.ok) ref.current?.reset();
          onDone?.(r);
        });
      }}
    >
      {children(pending)}
      {status ? (
        <span role="status" className={status.ok ? undefined : "toast-error"}>
          {" "}
          {status.message}
        </span>
      ) : null}
    </form>
  );
}

function Modal({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog ref={ref} aria-label={title}>
        <h2>{title}</h2>
        {children(close)}
        <form method="dialog" style={{ marginTop: 12 }}>
          <button type="submit">Close</button>
        </form>
      </dialog>
    </>
  );
}

const EXPERTISE = ["finance", "healthcare", "data-analysis", "operations", "legal"] as const;

/** Labeled demo presets (ADR-003): each drives the matching engine path. */
export function ScenarioButtons({
  routes,
}: {
  routes: { label: string; invoke: Invoke }[];
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }} aria-label="scenario presets">
      {routes.map((r) => (
        <ActionForm key={r.label} invoke={r.invoke}>
          {(pending) => (
            <button type="submit" title={`Route with scenario: ${r.label}`} disabled={pending}>
              {r.label}
            </button>
          )}
        </ActionForm>
      ))}
    </span>
  );
}

/** Accept / decline / fail, for assigned tasks. Destructive ones arm first (M-6). */
export function DecisionButtons({
  decisions,
}: {
  decisions: { decision: "accept" | "decline" | "fail"; invoke: Invoke }[];
}) {
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {decisions.map(({ decision, invoke }) => {
        const dangerous = decision !== "accept";
        return (
          <ActionForm
            key={decision}
            invoke={(fd) => {
              if (dangerous && armed !== decision) {
                setArmed(decision);
                return Promise.resolve({ ok: false, message: `Click ${decision} again to confirm` });
              }
              setArmed(null);
              return invoke(fd);
            }}
          >
            {(pending) => (
              <button
                type="submit"
                disabled={pending}
                className={decision === "accept" ? "btn-primary" : "btn-danger"}
              >
                {pending ? "…" : armed === decision ? `Confirm ${decision}?` : decision}
              </button>
            )}
          </ActionForm>
        );
      })}
    </span>
  );
}

/** Create modal (S5): labeled fields + Create / Create & route. */
export function CreateModal({ submit }: { submit: Invoke }) {
  return (
    <Modal label="+ New task" title="Create task">
      {(close) => (
        <ActionForm
          invoke={submit}
          onDone={(r) => {
            if (r.ok) close();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 280 }}
        >
          {(pending) => (
            <>
              <label htmlFor="modal-title">Task title</label>
              <input id="modal-title" name="title" required maxLength={200} />
              <label htmlFor="modal-expertise">Expertise</label>
              <select id="modal-expertise" name="expertise" defaultValue="finance">
                {EXPERTISE.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <fieldset>
                <legend>Priority</legend>
                <label>
                  <input type="radio" name="priority" value="low" /> low
                </label>{" "}
                <label>
                  <input type="radio" name="priority" value="normal" defaultChecked /> normal
                </label>{" "}
                <label>
                  <input type="radio" name="priority" value="high" /> high
                </label>
              </fieldset>
              <label>
                <input type="checkbox" name="route" value="1" defaultChecked /> Create & route
              </label>
              <button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create"}
              </button>
            </>
          )}
        </ActionForm>
      )}
    </Modal>
  );
}

/** Intervene modal (S6): candidate radios with match notes + armed cancel (S7). */
export function InterveneModal({
  title,
  attemptNote,
  candidates,
  assign,
  cancel,
}: {
  title: string;
  attemptNote: string;
  candidates: { id: string; name: string; note: string }[];
  assign: Invoke;
  cancel: Invoke;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Modal label="Intervene…" title={`Intervene — ${title}`}>
      {(close) => (
        <>
          <p style={{ color: "var(--muted)" }}>{attemptNote}</p>
          <ActionForm
            invoke={assign}
            onDone={(r) => {
              if (r.ok) close();
            }}
          >
            {(pending) => (
              <fieldset>
                <legend>Assign to</legend>
                {candidates.map((c, i) => (
                  <label key={c.id} style={{ display: "block" }}>
                    <input type="radio" name="contributorId" value={c.id} defaultChecked={i === 0} aria-label={`Assign to ${c.name}`} />{" "}
                    {c.name} <span style={{ color: "var(--muted)" }}>{c.note}</span>
                  </label>
                ))}
                <div style={{ marginTop: 8 }}>
                  <button type="submit" disabled={pending || candidates.length === 0}>
                    {pending ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </fieldset>
            )}
          </ActionForm>
          <ActionForm
            invoke={(fd) => {
              if (!armed) {
                setArmed(true);
                return Promise.resolve({ ok: false, message: "Click Cancel routing again to confirm" });
              }
              setArmed(false);
              return cancel(fd);
            }}
            onDone={(r) => {
              if (r.ok) close();
            }}
          >
            {(pending) => (
              <div style={{ marginTop: 8 }}>
                <button type="submit" disabled={pending} className="btn-danger">
                  {armed ? "Confirm cancel routing?" : "Cancel routing…"}
                </button>
              </div>
            )}
          </ActionForm>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Note: any late engine answer is ignored and logged.
          </p>
        </>
      )}
    </Modal>
  );
}

/** Recover modal (S7): explain, then re-route. */
export function RecoverModal({
  title,
  detail,
  recover,
}: {
  title: string;
  detail: string;
  recover: Invoke;
}) {
  return (
    <Modal label="Recover…" title={`Recover — ${title}`}>
      {(close) => (
        <>
          <p>{detail}</p>
          <p style={{ color: "var(--muted)" }}>History is kept; a new attempt gets a fresh ID.</p>
          <ActionForm
            invoke={recover}
            onDone={(r) => {
              if (r.ok) close();
            }}
          >
            {(pending) => (
              <button type="submit" disabled={pending}>
                {pending ? "Recovering…" : "Re-route"}
              </button>
            )}
          </ActionForm>
        </>
      )}
    </Modal>
  );
}
