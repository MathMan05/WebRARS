import {assemble, AssemblError} from "../assembler/assembler.js";
import {Console} from "../emulator/console.js";
import {Symstem} from "../emulator/emulator.js";
import {I18n} from "../i18n.js";
import {Directory} from "../utils/utils.js";
import {Line} from "./line.js";
interface StateEventMap {
	Assemble: AssembleEvent;
	changed: Event;
	save: Event;
}
type cursor =
	| {
			possitions: {
				line: number;
				index: number;
			}[];
	  }
	| {
			highlights: {
				start: {
					line: number;
					index: number;
				};
				end: {
					line: number;
					index: number;
				};
			}[];
	  };
const redispatched = new WeakSet();
window.addEventListener("paste", (event) => {
	if (redispatched.has(event)) {
		return;
	}
	const e = new ClipboardEvent("paste", event);
	redispatched.add(e);
	if (document.activeElement) {
		document.activeElement.dispatchEvent(e);
	}
});
class Editor extends EventTarget {
	lines: Line[];
	tabLength = 8;
	cursor: cursor = {
		possitions: [
			{
				line: 1,
				index: 0,
			},
		],
	};
	scroll = {
		linedown: 0,
		charleft: 0,
	};
	console: Console;
	fileName: string;
	fileDir?: string;
	fontSize = 14;
	past: {lines: Line[]; cursor: Editor["cursor"]}[] = [];
	future: {lines: Line[]; cursor: Editor["cursor"]}[] = [];
	dir: Directory | undefined;
	constructor(asm: string, fileName = "name", console: Console, proj: Directory | undefined) {
		super();
		this.console = console;
		this.lines = asm.split("\n").map((_) => new Line(_, this));
		if (this.lines.length === 0) {
			this.lines.push(new Line("", this));
		}
		this.fileName = fileName;
		this.dir = proj;
	}
	addEventListener<K extends keyof StateEventMap>(
		type: K,
		listener: (ev: StateEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions,
	) {
		//@ts-expect-error
		super.addEventListener(type, listener, options);
	}
	height = 18;
	charWidth = 18;
	renderToCanvas(ctx: CanvasRenderingContext2D) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		const fontSize = this.fontSize;
		const height = Math.floor(ctx.canvas.height / this.fontSize);
		this.height = height;
		ctx.font = `${fontSize}px monospace`;
		const charWidth = ctx.measureText("a").width;
		this.charWidth = charWidth;
		ctx.textBaseline = "hanging";
		const linedown = Math.floor(this.scroll.linedown);
		const widthNeeded = this.widthNeeded();
		for (let i = linedown; i < height + linedown; i++) {
			const line = this.lines[i];
			if (line && line.errored) {
				ctx.fillStyle = "lemonchiffon";
				const y = (i - linedown) * fontSize;
				ctx.fillRect(widthNeeded + 10, y, ctx.canvas.width, this.fontSize);
			}
		}

		if ("highlights" in this.cursor) {
			ctx.fillStyle = "LightBlue";
			function getStart(
				o1: {
					line: number;
					index: number;
				},
				o2: {
					line: number;
					index: number;
				},
			) {
				if (o1.line < o2.line) {
					return [o1, o2];
				} else if (o1.line > o2.line) {
					return [o2, o1];
				} else if (o1.index < o2.index) {
					return [o1, o2];
				} else {
					return [o2, o1];
				}
			}
			for (const high of this.cursor.highlights) {
				const h = getStart(high.start, high.end);
				if (h[0].line >= height + linedown || h[1].line < linedown) {
					continue;
				}

				for (let i = h[0].line; i <= h[1].line && i < height + linedown; i++) {
					let startx: number;
					let endx: number;
					if (h[0].line === i) {
						startx = widthNeeded + 10 + h[0].index * charWidth;
					} else {
						startx = widthNeeded + 10;
					}
					const endline = this.lines[i];
					if (h[1].line === i) {
						endx = widthNeeded + 10 + endline.moveCursor(h[1].index, 0) * charWidth;
					} else {
						endx = widthNeeded + 10 + endline.length() * charWidth;
					}
					endx -= startx;
					const y = (i - linedown) * fontSize;
					ctx.fillRect(startx, y, endx, fontSize);
				}
			}
		}

		for (let i = linedown; i < height + linedown; i++) {
			const line = this.lines[i];
			if (!line) break;
			const y = (i - linedown) * fontSize;

			let cursors: number[] = [];
			if ((this.blinkOffset + Date.now()) % this.blinkInterval < this.blinkInterval / 2) {
				if ("possitions" in this.cursor) {
					cursors = this.cursor.possitions.filter((_) => _.line === i).map((_) => _.index);
				} else {
					cursors = this.cursor.highlights.filter((_) => _.end.line === i).map((_) => _.end.index);
				}
			}
			line.drawLine(ctx, widthNeeded + 10, y, charWidth, cursors);
			ctx.fillStyle = "grey";
			ctx.fillRect(widthNeeded + 5, y, 1, fontSize);
			ctx.fillStyle = "black";
			ctx.fillText(`${i + 1}`, 4, y);
		}
	}
	widthNeeded() {
		return this.charWidth * Math.floor(Math.log(Math.max(this.lines.length, 33)));
	}
	blinkInterval = 800;
	blinkOffset = 0;
	focusCursors() {
		this.blinkOffset = -Date.now() % this.blinkInterval;
	}
	collectCurors() {
		if ("possitions" in this.cursor) {
			this.cursor.possitions.sort((a, b) => {
				if (a.line < b.line) {
					return 1;
				} else if (a.line > b.line) {
					return -1;
				} else {
					return +(a.index < b.index);
				}
			});
			this.cursor.possitions = this.cursor.possitions.filter((a, i, array) => {
				if (i === 0) {
					return true;
				} else {
					return a.index !== array[i - 1].index || a.line !== array[i - 1].line;
				}
			});
		}
	}
	getState() {
		return {lines: this.lines, cursor: structuredClone(this.cursor)};
	}
	pushPast() {
		this.past.push(this.getState());
		this.future = [];
	}
	string() {
		return this.lines.map((_) => _.str).join("\n");
	}
	castToHighlights() {
		if ("possitions" in this.cursor) {
			const arr: {
				start: {
					line: number;
					index: number;
				};
				end: {
					line: number;
					index: number;
				};
			}[] = [];
			for (const pos of this.cursor.possitions) {
				arr.push({
					start: pos,
					end: structuredClone(pos),
				});
			}
			this.cursor = {highlights: arr};
		}
	}
	sortHighlights() {
		if ("highlights" in this.cursor) {
			function getStart(
				o1: {
					line: number;
					index: number;
				},
				o2: {
					line: number;
					index: number;
				},
			) {
				if (o1.line < o2.line) {
					return [o1, o2];
				} else if (o1.line > o2.line) {
					return [o2, o1];
				} else if (o1.index < o2.index) {
					return [o1, o2];
				} else {
					return [o2, o1];
				}
			}
			this.cursor.highlights.sort((a, b) => {
				const [sa] = getStart(a.end, a.start);
				const [sb] = getStart(b.end, b.start);
				if (sa.line < sb.line) {
					return -1;
				} else if (sa.line > sb.line) {
					return 1;
				} else if (sa.index < sb.index) {
					return -1;
				} else {
					return 1;
				}
			});
			let prev = getStart(this.cursor.highlights[0].end, this.cursor.highlights[0].start);

			let first = true;
			const cursor: cursor = {highlights: []};
			cursor.highlights.push(this.cursor.highlights[0]);
			for (const pos of this.cursor.highlights) {
				if (first) {
					first = false;
					continue;
				}
				const cur = getStart(pos.end, pos.start);
				if (
					cur[0].line < prev[1].line ||
					(cur[0].line == prev[1].line && cur[0].index < prev[1].index)
				) {
					prev[1].line = cur[1].line;
					prev[1].index = cur[1].index;
				} else {
					cursor.highlights.push(pos);
					prev = cur;
				}
			}
			this.cursor = cursor;
		}
	}
	castToCursorsPassive() {
		if ("highlights" in this.cursor) {
			this.cursor = {
				possitions: this.cursor.highlights.map((_) => _.end),
			};
		}
	}
	giveError(e: AssemblError) {
		this.lines[e.line].error();
	}
	castToCursorsDestructive() {
		function getStart(
			o1: {
				line: number;
				index: number;
			},
			o2: {
				line: number;
				index: number;
			},
		) {
			if (o1.line < o2.line) {
				return [o1, o2];
			} else if (o1.line > o2.line) {
				return [o2, o1];
			} else if (o1.index < o2.index) {
				return [o1, o2];
			} else {
				return [o2, o1];
			}
		}
		if ("highlights" in this.cursor) {
			this.sortHighlights();
			const arr: {
				line: number;
				index: number;
			}[] = [];
			let i = 0;
			let h:
				| {
						line: number;
						index: number;
				  }[]
				| undefined = getStart(this.cursor.highlights[i].end, this.cursor.highlights[i].start);
			let realLineIndex = 0;
			const lines: Line[] = [];
			for (let j = 0; j < this.lines.length; j++) {
				const line = this.lines[j];
				if (h && j >= h[0].line) {
					let destroyed = false;
					const highlights: [number, number][] = [];
					if (j !== h[0].line) {
						destroyed = true;
						highlights.push([0, h[1].index]);
						i++;
						if (!this.cursor.highlights[i]) {
							h = undefined;
						} else {
							h = getStart(this.cursor.highlights[i].end, this.cursor.highlights[i].start);
						}
					}
					while (h && j === h[0].line) {
						if (h[1].line !== j) {
							highlights.push([h[0].index, line.length()]);
							break;
						} else {
							highlights.push([h[0].index, h[1].index]);
						}
						i++;
						if (!this.cursor.highlights[i]) {
							h = undefined;
							break;
						}
						h = getStart(this.cursor.highlights[i].end, this.cursor.highlights[i].start);
					}
					const dline = line.deleteRanges(highlights);
					let newLine: Line = dline.line;
					let offset = 0;
					if (destroyed) {
						const pop = lines.pop();
						if (pop) {
							offset = pop.str.length;
							newLine = new Line(pop.str + dline.line.str, this);
						}
					} else {
						realLineIndex++;
					}
					lines.push(newLine);
					for (const thing of dline.fakeCurors) {
						const i = thing + offset;
						arr.push({
							line: realLineIndex - 1,
							index: newLine.getFakeIndex(i),
						});
					}
					if (h) {
						if (h[1].line === j) {
						} else {
							j = h[1].line - 1;
						}
					}
				} else {
					lines.push(line);
					realLineIndex++;
				}
			}
			this.dispatchEvent(new Event("changed"));
			this.lines = lines;
			this.cursor = {possitions: arr};
			this.collectCurors();
		}
	}
	save() {
		this.dispatchEvent(new Event("save"));
	}
	shiftArrow(e: KeyboardEvent) {
		this.castToHighlights();
		if (!("highlights" in this.cursor)) throw Error("this will never happen :3");
		switch (e.key) {
			case "ArrowRight":
				for (const cursor of this.cursor.highlights) {
					const out = this.lines[cursor.end.line].moveCursor(cursor.end.index, e.ctrlKey ? 2 : 1);
					if (out === Infinity) {
						cursor.end.line++;
						cursor.end.line = Math.min(this.lines.length - 1, cursor.end.line);
						cursor.end.index = 0;
					} else {
						cursor.end.index = out;
					}
				}
				break;
			case "ArrowLeft":
				for (const cursor of this.cursor.highlights) {
					const out = this.lines[cursor.end.line].moveCursor(cursor.end.index, e.ctrlKey ? -2 : -1);
					if (out === -Infinity) {
						cursor.end.line--;
						cursor.end.line = Math.max(0, cursor.end.line);
						cursor.end.index = this.lines[cursor.end.line].length();
					} else {
						cursor.end.index = out;
					}
				}
				break;
			case "ArrowDown":
				for (const cursor of this.cursor.highlights) {
					cursor.end.line++;
					if (this.lines.length === cursor.end.line) {
						cursor.end.index = this.lines[this.lines.length - 1].length();
					}
					cursor.end.line = Math.min(this.lines.length - 1, cursor.end.line);
				}
				break;
			case "ArrowUp":
				for (const cursor of this.cursor.highlights) {
					cursor.end.line--;
					if (cursor.end.line === -1) {
						cursor.end.index = 0;
					}
					cursor.end.line = Math.max(0, cursor.end.line);
				}
				break;
		}
		this.sortHighlights();
	}
	copy() {
		if (!("highlights" in this.cursor)) {
			console.warn("copying for regular cursors is not implemented");
			return [];
		}
		this.sortHighlights();
		function getStart(
			o1: {
				line: number;
				index: number;
			},
			o2: {
				line: number;
				index: number;
			},
		) {
			if (o1.line < o2.line) {
				return [o1, o2];
			} else if (o1.line > o2.line) {
				return [o2, o1];
			} else if (o1.index < o2.index) {
				return [o1, o2];
			} else {
				return [o2, o1];
			}
		}

		let i = 0;
		let h:
			| {
					line: number;
					index: number;
			  }[]
			| undefined = getStart(this.cursor.highlights[i].end, this.cursor.highlights[i].start);
		const strings: string[] = [];
		for (let j = 0; j < this.lines.length; j++) {
			const line = this.lines[j];
			if (h && j >= h[0].line) {
				if (h[0].line < j && h[1].line > j) {
					strings.push(this.lines[j].str);
					continue;
				}
				const highlights: [number, number][] = [];
				if (j !== h[0].line) {
					highlights.push([0, h[1].index]);
					i++;
					if (!this.cursor.highlights[i]) {
						h = undefined;
					} else {
						h = getStart(this.cursor.highlights[i].end, this.cursor.highlights[i].start);
					}
				}
				while (h && j === h[0].line) {
					if (h[1].line !== j) {
						highlights.push([h[0].index, line.length()]);
						break;
					} else {
						highlights.push([h[0].index, h[1].index]);
					}
					i++;
					if (!this.cursor.highlights[i]) {
						h = undefined;
						break;
					}
					h = getStart(this.cursor.highlights[i].end, this.cursor.highlights[i].start);
				}
				const dline = line.getRanges(highlights);
				strings.push(...dline);
			}
		}
		return strings;
	}
	ownCanvas(c: HTMLCanvasElement) {
		let lastClicked = 0;
		const ctx = c.getContext("2d");
		if (!ctx) throw Error("Unable to get canvas context 2d");
		const mut = new ResizeObserver((e) => {
			for (const _ of e) {
			}
			const box = c.parentElement!.getBoundingClientRect();
			c.width = box.width;
			c.height = box.height;
			this.renderToCanvas(ctx);
		});
		c.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault();
				this.scroll.linedown += (e.deltaY / 400) * this.height;
				this.scroll.linedown = Math.min(
					this.scroll.linedown,
					this.lines.length - c.height / this.fontSize + 1,
				);
				this.scroll.linedown = Math.max(this.scroll.linedown, 0);
				this.renderToCanvas(ctx);
			},
			{passive: false},
		);

		c.contentEditable = "true";

		c.addEventListener("paste", (event) => {
			this.castToCursorsDestructive();
			this.collectCurors();
			console.log("paste");
			event.preventDefault();
			if (!event.clipboardData) return;
			const paste = event.clipboardData.getData("text");
			console.log(paste);
			if ("possitions" in this.cursor) {
				this.pushPast();
				const lines = new Set(this.cursor.possitions.map((_) => _.line));
				const newLines: Line[] = [];
				const possitions: {index: number; line: number}[] = [];
				let newI = 0;
				for (const i in this.lines) {
					if (lines.has(+i)) {
						const replace = this.lines[i].paste(
							this.cursor.possitions.filter((_) => _.line === +i).map((_) => _.index),
							paste,
						);
						for (const thing of replace.cursors) {
							possitions.push({
								line: newI + thing.line,
								index: thing.index,
							});
						}
						for (const thing of replace.lines) {
							newLines.push(thing);
							newI++;
						}
					} else {
						newLines.push(this.lines[i]);
						newI++;
					}
				}
				this.dispatchEvent(new Event("changed"));
				this.lines = newLines;
				this.cursor.possitions = possitions;
			}
			this.focusCursors();
			this.renderToCanvas(ctx);
		});
		c.addEventListener("keydown", (e) => {
			this.collectCurors();
			if (e.key.toLowerCase() === "v" && e.ctrlKey) {
				return;
			}
			if (e.key == "z" && e.ctrlKey && !e.altKey && !e.metaKey) {
				const pop = this.past.pop();
				if (!pop) return;
				this.future.push(this.getState());
				this.dispatchEvent(new Event("changed"));
				this.lines = pop.lines;
				this.cursor = pop.cursor;
				this.focusCursors();
				this.renderToCanvas(ctx);
				return;
			}
			if (e.key == "y" && e.ctrlKey && !e.altKey && !e.metaKey) {
				const pop = this.future.pop();
				if (!pop) return;
				this.past.push(this.getState());
				this.dispatchEvent(new Event("changed"));
				this.lines = pop.lines;
				this.cursor = pop.cursor;
				this.focusCursors();
				this.renderToCanvas(ctx);
				return;
			}
			e.preventDefault();
			if (e.key.startsWith("Arrow")) {
				if (!e.shiftKey) {
					this.castToCursorsPassive();
					if (!("possitions" in this.cursor))
						throw new Error("was just cast, should be possitions");
					switch (e.key) {
						case "ArrowLeft":
							for (const cursor of this.cursor.possitions) {
								const out = this.lines[cursor.line].moveCursor(cursor.index, e.ctrlKey ? -2 : -1);
								if (out === -Infinity) {
									cursor.line--;
									cursor.line = Math.max(0, cursor.line);
									cursor.index = this.lines[cursor.line].length();
								} else {
									cursor.index = out;
								}
							}
							break;
						case "ArrowRight":
							for (const cursor of this.cursor.possitions) {
								const out = this.lines[cursor.line].moveCursor(cursor.index, e.ctrlKey ? 2 : 1);
								if (out === Infinity) {
									cursor.line++;
									cursor.line = Math.min(this.lines.length - 1, cursor.line);
									cursor.index = 0;
								} else {
									cursor.index = out;
								}
							}
							break;
						case "ArrowDown":
							for (const cursor of this.cursor.possitions) {
								cursor.line++;
								if (this.lines.length === cursor.line) {
									cursor.index = this.lines[this.lines.length - 1].length();
								}
								cursor.line = Math.min(this.lines.length - 1, cursor.line);
							}
							break;
						case "ArrowUp":
							for (const cursor of this.cursor.possitions) {
								cursor.line--;
								if (cursor.line === -1) {
									cursor.index = 0;
								}
								cursor.line = Math.max(0, cursor.line);
							}
							break;
					}
				} else {
					this.shiftArrow(e);
				}
			} else if (
				(e.key.length === 1 || e.key === "Backspace" || e.key === "Enter" || e.key === "Tab") &&
				!e.metaKey &&
				!e.altKey &&
				!e.ctrlKey
			) {
				if ("highlights" in this.cursor) {
					this.pushPast();
					this.castToCursorsDestructive();
					if (e.key === "Backspace") {
						this.focusCursors();
						this.renderToCanvas(ctx);
						return;
					}
				}
				let key = e.key;
				if (key === "Tab") {
					key = "	";
				}
				if ("possitions" in this.cursor) {
					this.pushPast();
					const lines = new Set(this.cursor.possitions.map((_) => _.line));
					const newLines: Line[] = [];
					const possitions: {index: number; line: number}[] = [];
					let newI = 0;
					for (const i in this.lines) {
						if (lines.has(+i)) {
							const replace = this.lines[i].insert(
								this.cursor.possitions.filter((_) => _.line === +i).map((_) => _.index),
								key,
							);
							if (replace.orphaned) {
								let pop = newLines.pop();
								let line: Line;
								if (pop) {
									line = new Line(pop.str + replace.orphaned.text, this);
									newLines.push(line);
								} else {
									line = new Line(replace.orphaned.text, this);
									pop = line;
									newLines.push(line);
									newI++;
								}
								for (const thing of replace.orphaned.cursors) {
									possitions.push({
										line: newI - 1,
										index: line.getFakeIndex(Math.max(thing, 0) + pop.str.length),
									});
								}
							}
							for (const thing of replace.cursors) {
								possitions.push({
									line: newI + thing.line,
									index: thing.index,
								});
							}
							for (const thing of replace.lines) {
								newLines.push(thing);
								newI++;
							}
						} else {
							newLines.push(this.lines[i]);
							newI++;
						}
					}
					this.dispatchEvent(new Event("changed"));
					this.lines = newLines;
					this.cursor.possitions = possitions;
				}
			} else if (
				(e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x") &&
				e.ctrlKey &&
				!e.altKey &&
				!e.metaKey
			) {
				navigator.clipboard.writeText(this.copy().join("\n"));
				if (e.key === "x") {
					this.pushPast();
					this.castToCursorsDestructive();
				}
			} else if (e.key.toLowerCase() === "a" && e.ctrlKey && !e.altKey && !e.metaKey) {
				if (e.shiftKey) {
					console.log("not here?");
					this.castToCursorsPassive();
				} else {
					this.cursor = {
						highlights: [
							{
								start: {index: 0, line: 0},
								end: {
									index: this.lines[this.lines.length - 1].length(),
									line: this.lines.length - 1,
								},
							},
						],
					};
				}
			} else if (e.key === "a" && !e.ctrlKey && e.altKey && !e.metaKey) {
				this.assemble();
			} else if (e.key === "Backspace" && e.ctrlKey) {
				this.pushPast();
				this.castToCursorsDestructive();
				if ("highlight" in this.cursor) throw Error("oops, idk how I got here!");
				this.castToHighlights();
				if ("possitions" in this.cursor) throw Error("oops, idk how I got here!");
				for (const cursor of this.cursor.highlights) {
					const out = this.lines[cursor.end.line].moveCursor(cursor.end.index, -2);
					if (out === -Infinity) {
						cursor.end.line--;
						cursor.end.line = Math.max(0, cursor.end.line);
						cursor.end.index = this.lines[cursor.end.line].length();
					} else {
						cursor.end.index = out;
					}
				}
				this.castToCursorsDestructive();
				this.focusCursors();
				this.renderToCanvas(ctx);
				return;
			} else if (e.key === "s" && e.ctrlKey && !e.altKey && !e.metaKey) {
				this.save();
			}
			this.focusCursors();
			this.renderToCanvas(ctx);
		});
		let dragged: undefined | {line: number; index: number} = undefined;
		c.addEventListener("mousedown", (e) => {
			e.preventDefault();
			this.focusCursors();
			c.focus();
			if (e.button === 0) {
				const linePos = Math.min(
					Math.floor(e.offsetY / this.fontSize + this.scroll.linedown),
					this.lines.length - 1,
				);
				const line = this.lines[linePos];
				const curse = line.moveCursor(
					Math.round((e.offsetX - this.widthNeeded()) / this.charWidth) - 1,
					0,
				);
				dragged = {line: linePos, index: curse};
				if (e.shiftKey) {
					let start;
					if ("possitions" in this.cursor) {
						start = this.cursor.possitions[0];
					} else {
						start = this.cursor.highlights[0].start;
					}
					this.cursor = {
						highlights: [
							{
								start,
								end: {
									line: linePos,
									index: curse,
								},
							},
						],
					};
					this.renderToCanvas(ctx);
					return;
				}
				//TODO make this a setting
				if (Date.now() < lastClicked + 300) {
					dragged = undefined;
					if ("possitions" in this.cursor) {
						lastClicked = Date.now();
						const bounds = line.getWordBounds(curse);
						this.cursor = {
							highlights: [
								{
									start: {line: linePos, index: bounds[0]},
									end: {line: linePos, index: bounds[1]},
								},
							],
						};
						this.renderToCanvas(ctx);
						return;
					} else {
						this.cursor = {
							highlights: [
								{
									start: {line: linePos, index: 0},
									end: {line: linePos, index: line.length()},
								},
							],
						};
						this.renderToCanvas(ctx);
						return;
					}
				}
				lastClicked = Date.now();
				const cursor = {line: linePos, index: curse};
				if (!e.altKey) {
					this.cursor = {possitions: [cursor]};
				} else {
					if ("possitions" in this.cursor) {
						this.cursor.possitions.push(cursor);
					} else {
						this.cursor.highlights.push({
							start: cursor,
							end: structuredClone(cursor),
						});
					}
					this.collectCurors();
				}
			}
			this.renderToCanvas(ctx);
		});
		c.addEventListener("mouseup", () => {
			dragged = undefined;
		});
		c.addEventListener("mousemove", (e) => {
			if (dragged) {
				e.preventDefault();
				this.focusCursors();
				const linePos = Math.min(
					Math.floor(e.offsetY / this.fontSize + this.scroll.linedown),
					this.lines.length - 1,
				);
				const line = this.lines[linePos];
				const curse = line.moveCursor(
					Math.round((e.offsetX - this.widthNeeded()) / this.charWidth) - 1,
					0,
				);
				if (linePos !== dragged.line && dragged.index !== curse) {
					this.cursor = {
						highlights: [
							{
								start: dragged,
								end: {
									line: linePos,
									index: curse,
								},
							},
						],
					};
					this.renderToCanvas(ctx);
				}
			}
		});

		setInterval(() => {
			this.renderToCanvas(ctx);
		}, this.blinkInterval / 2);
		mut.observe(c);
		this.renderToCanvas(ctx);
	}
	static editMap = new Map<string, Editor>();
	async assemble() {
		//TODO I'm sure there's more I can do to make this much smaller in RAM
		try {
			this.console.addMessage("\n" + I18n.startingAssembly() + "\n\n");
			let emu: Symstem;
			if (this.dir && this.fileDir) {
				const dirL = this.fileDir.split("/");
				dirL.pop();
				const dir = dirL.join("/") + "/";
				const build: [string, string][] = [[this.string(), this.fileDir]];
				for await (const [name, thing] of this.dir.getAllInDir()) {
					if (thing instanceof Directory) continue;
					if (!name.endsWith(".asm")) continue;
					const thisDir = dir + name;
					if (thisDir === this.fileDir) continue;
					const editor = Editor.editMap.get(thisDir);
					if (editor) {
						build.push([editor.string(), thisDir]);
					} else {
						build.push([await thing.text(), thisDir]);
					}
				}
				const [ram, pc] = assemble(build);
				emu = new Symstem(ram, this.console);
				emu.pc = pc;
			} else {
				const [ram, pc] = assemble([[this.string(), this.fileDir || this.fileName]]);
				emu = new Symstem(ram, this.console);
				emu.pc = pc;
			}
			emu.intRegis[2] = 0x7fffeffcn;
			this.console.addMessage("\n" + I18n.finishedAssembly() + "\n\n");
			this.dispatchEvent(new AssembleEvent("Assemble", emu));
		} catch (e) {
			if (e instanceof AssemblError) {
				this.dispatchEvent(new AssembleEvent("Assemble", e));
			} else {
				throw e;
			}
		}
	}
	createEditor(): HTMLDivElement {
		const area = document.createElement("div");
		area.classList.add("flexttb", "editor");
		const c = document.createElement("canvas");
		area.append(c);
		this.ownCanvas(c);
		return area;
	}
}
class AssembleEvent extends Event {
	sys: Symstem | AssemblError;
	constructor(code: string, sys: Symstem | AssemblError) {
		super(code);
		this.sys = sys;
	}
}
export {Editor, AssembleEvent};
