import {CSymstem, runTimeError, Symstem} from "../emulator/emulator.js";
import {parseInt, toAsm} from "../emulator/parseInt.js";
import {registerNames} from "../fetches.js";
import {I18n} from "../i18n.js";

class Etab {
	private sys?: Symstem;
	private csys?: CSymstem;
	private csysQue: (undefined | CSymstem)[];
	private queEnd = 0;
	started = false;
	running: undefined | Promise<void>;
	stopped = true;
	htmlMap = new Map<number, HTMLElement>();
	constructor() {
		const start = document.getElementById("start") as HTMLElement;
		const step = document.getElementById("step") as HTMLElement;
		const reset = document.getElementById("reset") as HTMLElement;
		const backStep = document.getElementById("backStep") as HTMLElement;
		this.csysQue = new Array(1000);
		start.classList.add("disabled");
		step.classList.add("disabled");
		reset.classList.add("disabled");
		backStep.classList.add("disabled");
		start.onclick = () => {
			if (!start.classList.contains("disabled")) {
				this.start();
			}
		};
		reset.onclick = () => {
			if (!reset.classList.contains("disabled")) {
				this.reset();
			}
		};
		step.onclick = () => {
			if (!step.classList.contains("disabled")) {
				this.step();
			}
		};
		backStep.onclick = () => {
			if (!backStep.classList.contains("disabled")) {
				this.backStep();
			}
		};

		const speed = document.getElementById("speed") as HTMLInputElement;
		const speedTag = document.getElementById("speedTag") as HTMLSpanElement;
		const updateSpeed = () => {
			let calcSpeed: number;
			const r = +speed.value;
			if (r === 0) {
				calcSpeed = 0.05;
			} else if (r <= 12) {
				calcSpeed = r / 24;
			} else if (r < 98) {
				calcSpeed = (r - 9.4) / 2.6;
			} else {
				calcSpeed = 0;
			}
			if (calcSpeed === 0) {
				speedTag.textContent = I18n.speedMax();
			} else if (calcSpeed < 0.1) {
				speedTag.textContent = I18n.speed(Math.round(calcSpeed * 100) / 100 + "");
			} else if (calcSpeed < 1) {
				speedTag.textContent = I18n.speed(Math.round(calcSpeed * 10) / 10 + "");
			} else {
				speedTag.textContent = I18n.speed(Math.round(calcSpeed) + "");
			}
			if (calcSpeed) {
				this.wait = 1000 / calcSpeed;
			} else {
				this.wait = 0;
			}
		};
		updateSpeed();
		speed.oninput = () => {
			updateSpeed();
		};
	}
	enque() {
		if (this.sys) {
			this.csysQue[this.queEnd++ % 1000] = this.sys.compact();
			this.queEnd %= 1000;
		}
	}
	backStep() {
		let elm = this.htmlMap.get(this.sys?.pc as number);
		if (elm) {
			elm.classList.remove("running");
		}
		const back = this.csysQue[this.queEnd - 1];
		this.csysQue[--this.queEnd] = undefined;
		this.queEnd += 1000;
		this.queEnd %= 1000;
		if (back) {
			this.sys = back.unCompact();
			this.systemReg();
		}
		elm = this.htmlMap.get(this.sys?.pc as number);
		if (elm && this.sys && !this.sys.done) {
			elm.classList.add("running");
		}
		this.changeButtonStates();
		this.updateRegis();
		for (const addr of this.memMap.keys()) {
			this.updateMemCell(addr, false);
		}
	}
	handSystem(sys: Symstem) {
		this.csysQue = new Array(1000);
		this.sys = sys;
		this.systemReg();
		this.csys = sys.compact();
	}
	systemReg() {
		if (!this.sys) return;
		this.sys.setMem = (addr) => {
			this.updateMemCell(addr);
		};
	}
	async reset() {
		if (!this.csys) return;
		let elm = this.htmlMap.get(this.sys?.pc as number);
		if (elm) {
			elm.classList.remove("running");
		}

		this.sys = this.csys.unCompact();
		this.systemReg();
		elm = this.htmlMap.get(this.sys.pc);
		if (elm && !this.sys.done) {
			elm.classList.add("running");
		}
		this.csysQue = new Array(1000);
		this.changeButtonStates();
		this.updateRegis();

		this.regenMemTable();
	}
	changeButtonStates() {
		const start = document.getElementById("start") as HTMLButtonElement;
		const step = document.getElementById("step") as HTMLButtonElement;
		const reset = document.getElementById("reset") as HTMLButtonElement;
		const backStep = document.getElementById("backStep") as HTMLElement;
		if (this.sys) {
			reset.classList.remove("disabled");
			if (this.sys.done) {
				start.classList.add("disabled");
				step.classList.add("disabled");
			} else {
				start.classList.remove("disabled");
				step.classList.remove("disabled");
			}
			if (this.csysQue[this.queEnd - 1]) {
				backStep.classList.remove("disabled");
			} else {
				backStep.classList.add("disabled");
			}
		} else {
			start.classList.add("disabled");
			step.classList.add("disabled");
			reset.classList.add("disabled");
			backStep.classList.add("disabled");
		}
	}
	htmlRegMap = new WeakMap<HTMLElement, HTMLElement[]>();
	lastRegi: [number, boolean] = [-1, false];
	updateRegis() {
		this.updateLastUsed();
		const regiArea = document.getElementById("regiArea") as HTMLElement;
		if (!this.sys) {
			regiArea.innerHTML = "";
			return;
		}

		let elm = regiArea.children[0] as HTMLElement;
		if (elm) {
			const arr = this.htmlRegMap.get(elm as HTMLElement);
			if (arr) {
				for (let i = 0; i < 32; i++) {
					const parent = arr[i].parentElement;
					if (parent) {
						if (!this.lastRegi[1] && this.lastRegi[0] === i) {
							parent.classList.add("LastUsed");
						} else {
							parent.classList.remove("LastUsed");
						}
					}
					arr[i].textContent = "0x" + this.sys.UintRegis[i].toString(16).padStart(16, "0");
				}
				return;
			}
		}
		regiArea.innerHTML = "";
		elm = document.createElement("table");
		elm.classList.add("regiTable");
		const regis: HTMLElement[] = [];

		const tr = document.createElement("tr");
		const name = document.createElement("td");
		name.textContent = I18n.regiTab.name();
		const number = document.createElement("td");
		number.textContent = I18n.regiTab.number();
		const value = document.createElement("td");
		value.textContent = I18n.regiTab.value();
		tr.append(name, number, value);
		elm.append(tr);

		for (let i = 0; i < 32; i++) {
			const tr = document.createElement("tr");
			const name = document.createElement("td");
			name.textContent = registerNames.int[i][1];
			const number = document.createElement("td");
			number.textContent = i + "";
			const value = document.createElement("td");
			regis.push(value);
			tr.append(name, number, value);
			elm.append(tr);
		}
		regiArea.append(elm);
		this.htmlRegMap.set(elm, regis);
		this.updateRegis();
	}
	enableButtons() {
		this.changeButtonStates();
	}
	disable() {
		this.sys = undefined;
		this.running = undefined;
		this.htmlMap = new Map();
		this.started = false;
		this.csysQue = new Array(1000);
		this.changeButtonStates();
	}
	updateLastUsed() {
		try {
			const past = this.csysQue[this.queEnd - 1];
			if (this.sys && past) {
				const ram = past.ram.toRam();
				const inst = ram.getInt32(past.pc);
				const instruction = parseInt(inst);
				if ("rd" in instruction) {
					this.lastRegi = [instruction.rd, false];
				}
			}
		} catch {}
	}
	wait = 100;
	async waitStep() {
		if (this.wait < 250) {
			await new Promise((res) => setTimeout(res, this.wait));
			return;
		}
		const time = performance.now();
		while (true) {
			await new Promise((res) => setTimeout(res, 100));
			const timeLeft = this.wait - (performance.now() - time);
			if (timeLeft < 250) {
				await new Promise((res) => setTimeout(res, timeLeft));
				return;
			}
		}
	}
	async start() {
		if (this.sys) {
			if (this.running) await this.running;
			this.stopped = false;
			const sys = this.sys;
			this.running = new Promise<void>(async (res) => {
				let elm = this.htmlMap.get(sys.pc);
				if (elm) {
					elm.classList.remove("running");
				}
				try {
					let i = 0;
					do {
						if (this.wait) {
							await this.step(true);
							console.log("waitStep");
							await this.waitStep();
						} else {
							this.enque();
							if (i >= 1000) {
								i = 0;
								await new Promise((res) => setTimeout(res, 10));
							}
							i++;
							if (!(await sys.step())) {
								break;
							}
						}
					} while (!this.stopped);
				} catch (e) {
					if (e instanceof runTimeError) {
						sys.console.addIO(e.message, true);
					} else {
						console.error(e);
					}
				}
				this.updateRegis();
				elm = this.htmlMap.get(sys.pc);
				if (elm && !sys.done) {
					elm.classList.add("running");
				}
				res();
				this.changeButtonStates();
				this.running = undefined;
			});
		}
	}
	async step(effectStopped = false) {
		if (this.running) return await this.running;
		this.running = new Promise<void>(async (res) => {
			try {
				if (this.sys) {
					let elm = this.htmlMap.get(this.sys.pc);
					if (elm) {
						elm.classList.remove("running");
					}

					this.enque();
					const sys = this.sys;
					try {
						if (effectStopped) {
							this.stopped ||= !(await sys.step());
						} else {
							await sys.step();
						}
					} catch (e) {
						if (e instanceof runTimeError) {
							sys.console.addIO(e.message, true);
						} else {
							console.error(e);
						}
					}
					elm = this.htmlMap.get(this.sys.pc);
					if (elm && !sys.done) {
						elm.classList.add("running");
					}
					this.updateRegis();
				}
				this.changeButtonStates();
				this.running = undefined;
			} catch (e) {
				res();
			}
		});
	}
	createHTML() {
		this.htmlMap = new Map();
		const div = document.createElement("div");
		div.classList.add("flexttb", "dontgrow");
		const scrollTable = document.createElement("div");
		scrollTable.classList.add("scrollTable");
		const table = document.createElement("table");
		scrollTable.append(table);
		div.append(scrollTable);

		const tr = document.createElement("tr");
		const address = document.createElement("th");
		address.textContent = I18n.address();
		tr.append(address);

		const code = document.createElement("th");
		code.textContent = I18n.code();
		tr.append(code);

		const basic = document.createElement("th");
		basic.textContent = I18n.basic();
		tr.append(basic);
		table.append(tr);
		if (this.sys) {
			this.enableButtons();
			let val: number;

			for (let i = 0x00400000; (val = this.sys.ram.getInt32(i)) !== 0; i += 4) {
				const tr = document.createElement("tr");
				this.htmlMap.set(i, tr);
				if (i === this.sys.pc && !this.sys.done) {
					tr.classList.add("running");
				}
				const address = document.createElement("td");
				address.textContent = "0x" + i.toString(16).padStart(8, "0");
				tr.append(address);

				const code = document.createElement("td");
				code.textContent = "0x" + (val >>> 0).toString(16).padStart(8, "0");
				tr.append(code);

				const basic = document.createElement("td");
				basic.textContent = toAsm(val);
				tr.append(basic);
				table.append(tr);
			}
		}
		this.updateRegis();
		{
			const bigElm = document.createElement("div");
			bigElm.classList.add("flexttb", "memView");
			const scrollTable = document.createElement("div");
			scrollTable.classList.add("scrollTable");
			const memoryTable = document.createElement("table");
			this.regenMemTable(memoryTable);
			scrollTable.append(memoryTable);
			this.curMemTable = memoryTable;
			bigElm.append(scrollTable);
			div.append(bigElm);

			const controls = document.createElement("div");
			controls.classList.add("flexltr", "controls");

			const left = document.createElement("button");
			left.textContent = "⬅";
			left.onclick = () => {
				this.memAddr -= 0x200;
				this.regenMemTable();
			};
			const right = document.createElement("button");
			right.textContent = "➡";
			right.onclick = () => {
				this.memAddr += 0x200;
				this.regenMemTable();
			};

			const sel = document.createElement("select");

			const places = {
				data: 0x10010000,
				stack: 0x7fffeffc - 8 * 4 * 16,
				text: 0x00400000,
			} as const;
			for (const [place, addr] of Object.entries(places)) {
				const p = place as keyof typeof places;
				const option = document.createElement("option");
				option.textContent = I18n.memPlaces[p]("0x" + addr.toString(16).padStart(8, "0"));
				option.value = place;
				sel.append(option);
			}
			sel.onchange = () => {
				this.memAddr = places[sel.value as keyof typeof places];
				this.regenMemTable();
			};

			controls.append(left, right, sel);

			bigElm.append(controls);
		}
		return div;
	}
	memAddr = 0x10010000;
	memMap = new Map<number, HTMLElement>();
	curMemTable?: HTMLTableElement;
	regenMemTable(table: HTMLTableElement | undefined = this.curMemTable) {
		if (!table) return;
		table.innerHTML = "";
		this.memMap = new Map<number, HTMLElement>();
		const tr = document.createElement("tr");
		const address = document.createElement("th");
		address.textContent = I18n.address();
		tr.append(address);

		for (let i = 0; i < 8; i++) {
			const heads = document.createElement("th");
			heads.textContent = I18n.memvalue((i * 4).toString(16));
			tr.append(heads);
		}
		table.append(tr);

		for (let row = 0; row < 16; row++) {
			const tr = document.createElement("tr");
			const offset = this.memAddr + row * 8 * 4;
			const address = document.createElement("th");
			address.textContent = "0x" + offset.toString(16);
			tr.append(address);
			for (let cell = 0; cell < 8; cell++) {
				const cellHTML = document.createElement("td");
				cellHTML.onclick = () => {
					if (cellHTML.children.length) {
						return;
					}
					const val = cellHTML.textContent || "";
					cellHTML.textContent = "";
					const input = document.createElement("input");
					input.value = val;
					cellHTML.append(input);
					input.focus();
					input.onkeydown = (e) => {
						if (e.key === "Enter") {
							input.blur();
						}
					};
					input.onblur = () => {
						this.write32(addr, globalThis.parseInt(input.value));
						this.updateMemCell(addr, false);
					};
				};
				const addr = offset + cell * 4;
				this.memMap.set(addr, cellHTML);
				this.updateMemCell(addr, false);
				tr.append(cellHTML);
			}
			table.append(tr);
		}
	}
	write32(addr: number, numb: number) {
		try {
			this.sys?.ram.setInt32(addr, numb);
		} catch {
			return;
		}
	}
	get32MemOr0(addr: number) {
		try {
			return this.sys?.ram.getUint32(addr) || 0;
		} catch {
			return 0;
		}
	}
	lastCell?: HTMLElement;
	updateMemCell(addr: number, highlight = true) {
		const cell = this.memMap.get(addr);
		if (!cell) return;
		cell.textContent = `0x${this.get32MemOr0(addr).toString(16).padStart(8, "0")}`;
		if (highlight) {
			this.lastCell?.classList.remove("LastUsed");
			cell.classList.add("LastUsed");
			this.lastCell = cell;
		}
	}
}
export {Etab};
