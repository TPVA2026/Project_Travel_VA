import { useState } from "react";
import { foldText, loadLocations, matchProvinces, VIETNAM_PROVINCE_LOCATIONS } from "./provinces";

// Accessible combobox (ARIA 1.2 list autocomplete) over Vietnam's provinces and,
// after two or more typed characters, their wards/communes. The text is never
// replaced unless the user picks an option; Enter without a highlighted option
// keeps its normal meaning (go to the next question).
export default function ProvinceInput({ id, onPick, className, "aria-describedby": describedBy, ...inputProps }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [locations, setLocations] = useState(VIETNAM_PROVINCE_LOCATIONS);
  const listId = `${id}-suggestions`;
  const matches = matchProvinces(query, { locations });
  const exact = matches.length === 1 && foldText(matches[0]) === foldText(query);
  const shown = open && matches.length > 0 && !exact;

  function ensureLocations() {
    loadLocations().then(data => {
      if (data) setLocations(data);
    }).catch(() => {});
  }

  function pick(name) {
    onPick(name);
    setQuery(name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!matches.length || exact) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive(current => {
        if (!shown) return step > 0 ? 0 : matches.length - 1;
        const next = current + step;
        return next >= matches.length ? 0 : next < 0 ? matches.length - 1 : next;
      });
    } else if (event.key === "Enter" && shown && active >= 0 && active < matches.length) {
      event.preventDefault();
      pick(matches[active]);
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="request-combobox">
      <input
        id={id}
        {...inputProps}
        className={className}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 && active < matches.length ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        onInput={event => { setQuery(event.currentTarget.value); setOpen(true); setActive(-1); ensureLocations(); }}
        onFocus={event => { setQuery(event.currentTarget.value); ensureLocations(); }}
        onKeyDown={onKeyDown}
        onBlur={() => { setOpen(false); setActive(-1); }}
      />
      <ul id={listId} role="listbox" className="request-suggestions" aria-label="Location suggestions" hidden={!shown}>
        {shown && matches.map((name, index) => (
          <li
            key={name}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={index === active ? "active" : undefined}
            onMouseDown={event => event.preventDefault()}
            onClick={() => pick(name)}
          >{name}</li>
        ))}
      </ul>
    </div>
  );
}
