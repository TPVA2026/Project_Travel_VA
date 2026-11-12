import { useState } from "react";
import Icon from "../common/Icon.jsx";
import { allProvincesSorted, foldText, matchProvinces, POPULAR_PROVINCES, provinceHint } from "./provinces";

// Accessible combobox (ARIA 1.2 list autocomplete) over Vietnam's 34 provinces.
// The browse panel opens on a user click, on typing, or on ArrowDown / Alt+ArrowDown —
// not on programmatic or step autofocus. The text is never replaced unless the user
// picks an option; Enter without a highlighted option keeps its normal meaning
// (go to the next question).
export default function ProvinceInput({ id, onPick, className, "aria-describedby": describedBy, ...inputProps }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = `${id}-suggestions`;
  const browsing = !foldText(query);
  const matches = browsing ? [] : matchProvinces(query);
  const exact = !browsing && matches.length === 1 && foldText(matches[0]) === foldText(query);
  const options = browsing
    ? [
        ...POPULAR_PROVINCES.map(name => ({ name, group: "popular", hint: provinceHint(name) })),
        ...allProvincesSorted().map(name => ({ name, group: "all", hint: provinceHint(name) })),
      ]
    : matches.map(name => ({ name, group: "match", hint: provinceHint(name) }));
  const shown = open && options.length > 0 && !exact;

  function pick(name) {
    onPick(name);
    setQuery(name);
    setOpen(false);
    setActive(-1);
  }

  function openPanel() {
    setOpen(true);
  }

  function onKeyDown(event) {
    const arrowDown = event.key === "ArrowDown";
    const arrowUp = event.key === "ArrowUp";
    if (arrowDown || (arrowUp && shown)) {
      if (exact) return;
      if (!browsing && !matches.length) return;
      event.preventDefault();
      const step = arrowDown ? 1 : -1;
      setOpen(true);
      setActive(current => {
        if (!shown) return step > 0 ? 0 : options.length - 1;
        const next = current + step;
        return next >= options.length ? 0 : next < 0 ? options.length - 1 : next;
      });
    } else if (event.key === "Enter" && shown && active >= 0 && active < options.length) {
      event.preventDefault();
      pick(options[active].name);
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  function renderOption(option, index) {
    return (
      <li
        key={`${option.group}-${option.name}`}
        id={`${listId}-${index}`}
        role="option"
        data-group={option.group}
        aria-selected={index === active}
        className={`request-city-option${index === active ? " active" : ""}`}
        onMouseDown={event => event.preventDefault()}
        onClick={() => pick(option.name)}
      >
        <Icon name="mapPin" size={18} className="request-city-pin" />
        <span className="request-city-text">
          <span className="request-city-name">{option.name}</span>
          <span className="request-city-hint">{option.hint}</span>
        </span>
      </li>
    );
  }

  const popular = options.map((option, index) => ({ option, index })).filter(item => item.option.group === "popular");
  const all = options.map((option, index) => ({ option, index })).filter(item => item.option.group === "all");

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
        aria-activedescendant={shown && active >= 0 && active < options.length ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        onInput={event => { setQuery(event.currentTarget.value); openPanel(); setActive(-1); }}
        onFocus={event => { setQuery(event.currentTarget.value); }}
        onPointerDown={openPanel}
        onClick={openPanel}
        onKeyDown={onKeyDown}
        onBlur={() => { setOpen(false); setActive(-1); }}
      />
      <div id={listId} className="request-city-panel" role="listbox" aria-label="Province suggestions" hidden={!shown}>
        {browsing && shown ? (
          <>
            <div className="request-city-group" role="group" aria-labelledby={`${listId}-popular`} data-section="popular">
              <h3 id={`${listId}-popular`} className="request-city-heading">Popular destinations</h3>
              <ul className="request-city-list">{popular.map(({ option, index }) => renderOption(option, index))}</ul>
            </div>
            <div className="request-city-group" role="group" aria-labelledby={`${listId}-all`} data-section="all">
              <h3 id={`${listId}-all`} className="request-city-heading">All provinces &amp; cities</h3>
              <ul className="request-city-list">{all.map(({ option, index }) => renderOption(option, index))}</ul>
            </div>
          </>
        ) : (
          shown && <ul className="request-city-list">{options.map((option, index) => renderOption(option, index))}</ul>
        )}
      </div>
    </div>
  );
}
