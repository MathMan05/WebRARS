import {CSymstem, runTimeError, Symstem} from "../emulator/emulator.js";
import {toAsm} from "../emulator/parseInt.js";
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
		}
		elm = this.htmlMap.get(this.sys?.pc as number);
		if (elm) {
			elm.classList.add("running");
		}
		this.changeButtonStates();
		this.updateRegis();
	}
	handSystem(sys: Symstem) {
		this.sys = sys;
		this.csys = sys.compact();
	}
	async reset() {
		if (!this.csys) return;
		let elm = this.htmlMap.get(this.sys?.pc as number);
		if (elm) {
			elm.classList.remove("running");
		}

		this.sys = this.csys.unCompact();
		elm = this.htmlMap.get(this.sys.pc);
		if (elm) {
			elm.classList.add("running");
		}
		this.csysQue = new Array(1000);
		this.changeButtonStates();
		this.updateRegis();
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
	updateRegis() {
		if (!this.sys) return;
		const regiArea = document.getElementById("regiArea") as HTMLElement;
		const elm = regiArea.children[0];
		if (elm) {
			const arr = this.htmlRegMap.get(elm as HTMLElement);
			if (!arr) return;
			for (let i = 0; i < 32; i++) {
				arr[i].textContent = "0x" + this.sys.UintRegis[i].toString(16).padStart(16, "0");
			}
		} else {
			const elm = document.createElement("table");
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
					do {
						this.enque();
					} while ((await sys.step()) && !this.stopped);
				} catch (e) {
					if (e instanceof runTimeError) {
						sys.console.addIO(e.message, true);
					} else {
						console.error(e);
					}
				}
				this.updateRegis();
				elm = this.htmlMap.get(sys.pc);
				if (elm) {
					elm.classList.add("running");
				}
				res();
				this.changeButtonStates();
				this.running = undefined;
			});
		}
	}
	async step() {
		if (this.running) return await this.running;
		this.running = new Promise<void>(async (res) => {
			if (this.sys) {
				let elm = this.htmlMap.get(this.sys.pc);
				if (elm) {
					elm.classList.remove("running");
				}

				this.enque();
				const sys = this.sys;
				try {
					await sys.step();
				} catch (e) {
					if (e instanceof runTimeError) {
						sys.console.addIO(e.message, true);
					} else {
						console.error(e);
					}
				}
				elm = this.htmlMap.get(this.sys.pc);
				if (elm) {
					elm.classList.add("running");
				}
				this.updateRegis();
			}
			res();
			this.changeButtonStates();
			this.running = undefined;
		});
	}
	createHTML() {
		this.htmlMap = new Map();
		const div = document.createElement("div");
		div.classList.add("flexttb", "dontgrow");
		const scrollTable = document.createElement("div");
		const table = document.createElement("table");
		scrollTable.append(table);
		div.append(scrollTable);
		scrollTable.classList.add("scrollTable");
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
				if (i === this.sys.pc) {
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
		return div;
	}
}
export {Etab};
