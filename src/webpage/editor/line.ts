import {parseLine} from "../assembler/parser.js";
import {Editor} from "./editor.js";

class Line {
	readonly str: string;
	readonly owner: Editor;
	errored = false;
	/**
	 * str should *not* contain any new lines
	 */
	constructor(str: string, owner: Editor) {
		this.str = str;
		this.owner = owner;
		return this;
	}
	error() {
		this.errored = true;
	}
	drawLine(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		charWidth: number,
		cursors: number[] = [],
	) {
		let chars = 0;
		for (const thing of parseLine(this.str)) {
			let color: string;
			//TODO undo hardcoding of values
			switch (thing.type) {
				case "invalidString":
				case "invalidChar":
					color = "red";
					break;
				case "instruction":
					color = "blue";
					break;
				case "register":
					color = "red";
					break;
				case "variable":
					color = "goldenrod";
					break;
				case "string":
				case "comment":
				case "char":
					color = "green";
					break;
				case "directive":
					color = "magenta";
					break;
				//@ts-expect-error
				default:
					console.warn("case " + thing.type + " is not defined");
				case "number":
				case "space":
				case "label":
				case "parentheses":
				case "unknown":
					color = "black";
			}
			ctx.fillStyle = color;
			const split = thing.content.split("	");
			let i = 0;
			for (const str of split) {
				i++;
				ctx.fillText(str, x + chars * charWidth, y);
				chars += str.length;
				if (split.length !== i) {
					chars++;
					chars = Math.ceil(chars / this.owner.tabLength) * this.owner.tabLength;
				}
			}
		}
		ctx.fillStyle = "black";
		for (const cursor of cursors) {
			ctx.fillRect(x + this.moveCursor(cursor, 0) * charWidth, y, 1, this.owner.fontSize);
		}
	}
	deleteRanges(ranges: [number, number][]): {line: Line; fakeCurors: number[]} {
		const real = ranges
			.flat()
			.sort((a, b) => a - b)
			.map((_) => this.getActualIndex(_));
		let prev = 0;
		for (const thing in real) {
			real[thing] -= prev;
			prev += real[thing];
		}
		let subString = this.str;
		let strings: string[] = [];
		for (const thing of real) {
			if (thing === 0) {
				strings.push("");
			} else {
				strings.push(subString.substring(0, thing));
				subString = subString.substring(thing);
			}
		}
		strings = strings.filter((_, i) => !(i % 2));
		let runningTotal = 0;
		const fakeCurors: number[] = [];
		for (const thing of strings) {
			runningTotal += thing.length;
			fakeCurors.push(runningTotal);
		}
		return {
			line: new Line(strings.join("") + subString, this.owner),
			fakeCurors: fakeCurors,
		};
	}
	getRanges(ranges: [number, number][]): string[] {
		const real = ranges
			.flat()
			.sort((a, b) => a - b)
			.map((_) => this.getActualIndex(_));
		let prev = 0;
		for (const thing in real) {
			real[thing] -= prev;
			prev += real[thing];
		}
		let subString = this.str;
		let strings: string[] = [];
		for (const thing of real) {
			if (thing === 0) {
				strings.push("");
			} else {
				strings.push(subString.substring(0, thing));
				subString = subString.substring(thing);
			}
		}
		strings = strings.filter((_, i) => i % 2);
		return strings;
	}
	getFakeIndex(index: number) {
		if (index <= 0) return 0;
		let i = 0;
		let real = 0;
		for (const char of this.str) {
			real++;
			i++;
			if (char === "	") {
				i = Math.ceil(i / 8) * 8;
			}
			if (real === index) {
				break;
			}
		}
		return i;
	}
	getActualIndex(index: number) {
		if (index <= 0) return 0;
		let i = 0;
		let real = 0;
		for (const char of this.str) {
			real++;
			i++;
			if (char === "	") {
				i = Math.ceil(i / 8) * 8;
			}
			if (i >= index) {
				break;
			}
		}
		return real;
	}
	getWordBounds(index: number): [number, number] {
		if (this.str === "" && index === 0) return [0, 0];
		const real = this.getActualIndex(index);
		let len = 0;
		let word: string | undefined = undefined;
		for (const [part] of this.str.matchAll(/([a-zA-Z0-9]+)|(\s+)|(.)/g)) {
			len += part.length;
			if (len >= real) {
				word = part;
				break;
			}
		}
		if (!word) throw Error("Word not found somehow");
		const bounds = [len - word.length, len].map((_) => this.getFakeIndex(_));
		return bounds as [number, number];
	}
	moveCursor(current: number, by: -2 | -1 | 0 | 1 | 2): number {
		let real = this.getActualIndex(current);
		let prev = this.str[real - 1];
		let next = this.str[real];
		switch (by) {
			case 0:
				return this.getFakeIndex(real);
			case 1:
				if (next) {
					real++;
					return this.getFakeIndex(real);
				} else {
					return Infinity;
				}
			case -1:
				if (prev) {
					real--;
					return this.getFakeIndex(real);
				} else {
					return -Infinity;
				}
			case 2:
				if (next) {
					const sutStr = this.str.substring(real, this.str.length);
					const match = sutStr.match(
						/\s+|[`~!%^&*()\-=+\[\]{}\\|;:'",<.>\/?]+\s*|[A-Z0-9]?[a-z0-9]+[\s_]*|[A-Z0-9]+(?![a-z0-9])[\s_]*|./,
					);
					if (match) {
						real += match[0].length;
					} else {
						real++;
					}
					return this.getFakeIndex(real);
				} else {
					return Infinity;
				}
			case -2:
				if (prev) {
					const sutStr = this.str.substring(0, real);
					const match = sutStr.match(
						/(\s+|[`~!%^&*()\-=+\[\]{}\\|;:'",<.>\/?]+\s*|[A-Z0-9]?[a-z0-9]+[\s_]*|[A-Z0-9]+(?![a-z0-9])[\s_]*|.)$/,
					);
					if (match) {
						real -= match[0].length;
					} else {
						real--;
					}
					return this.getFakeIndex(real);
				} else {
					return -Infinity;
				}
		}
	}
	paste(
		possitions: number[],
		text: string,
	): {
		lines: Line[];
		cursors: {line: number; index: number}[];
	} {
		possitions.sort((a, b) => a - b);
		const real = possitions.map((_) => this.getActualIndex(_));
		let prev = 0;
		for (const thing in real) {
			real[thing] -= prev;
			prev += real[thing];
		}
		let subString = this.str;
		const strings: string[] = [];
		for (const thing of real) {
			if (thing === 0) {
				strings.push("");
			} else {
				strings.push(subString.substring(0, thing));
				subString = subString.substring(thing);
			}
		}
		const lines = text.split("\n");
		const lineArr: Line[] = [];
		const last = (lines.length - 1).toString();
		const cursors: {line: number; index: number}[] = [];
		let cary = "";
		for (const thing of strings) {
			cary = cary + thing;
			for (let index in lines) {
				let line = cary + lines[index];
				cary = "";
				if (last === index) {
					cary = line;
					cursors.push({
						line: lineArr.length,
						index: this.length(line),
					});
				} else {
					lineArr.push(new Line(line, this.owner));
				}
			}
		}
		cary += subString;
		if (cary) {
			lineArr.push(new Line(cary, this.owner));
		}
		return {
			lines: lineArr,
			cursors,
		};
	}
	insert(
		possitions: number[],
		text: string,
	): {
		lines: Line[];
		cursors: {line: number; index: number}[];
		orphaned?: {
			text: string;
			cursors: number[];
		};
	} {
		possitions.sort((a, b) => a - b);
		const real = possitions.map((_) => this.getActualIndex(_));
		let prev = 0;
		for (const thing in real) {
			real[thing] -= prev;
			prev += real[thing];
		}
		let subString = this.str;
		const strings: string[] = [];
		for (const thing of real) {
			if (thing === 0) {
				strings.push("");
			} else {
				strings.push(subString.substring(0, thing));
				subString = subString.substring(thing);
			}
		}

		if (text.length !== 1) {
			if (text === "Backspace") {
				const newText = strings.map((_) => _.substring(0, _.length - 1)).join("") + subString;
				const line = new Line(newText, this.owner);
				let prev = 0;
				for (const thing in real) {
					real[thing] += prev;
					prev = real[thing];
					real[thing] += -thing - 1;
				}

				if (strings[0] !== "") {
					return {
						lines: [line],
						cursors: real
							.map((_) => line.getFakeIndex(_))
							.map((index) => {
								return {line: 0, index};
							}),
					};
				} else {
					return {
						lines: [],
						cursors: [],
						orphaned: {
							text: newText,
							cursors: real,
						},
					};
				}
			} else if (text === "Enter") {
				strings.push(subString);
				return {
					lines: strings.map((_) => new Line(_, this.owner)),
					cursors: strings
						.map((_, a) => a)
						.filter((_) => _ !== 0)
						.map((_) => {
							return {line: _, index: 0};
						}),
				};
			}
			throw Error("not handled yet");
		} else {
			strings.push(subString);
			const line = new Line(strings.join(text), this.owner);
			let prev = 0;
			for (const thing in real) {
				real[thing] += prev;
				prev = real[thing];
				real[thing] += +thing + 1;
			}
			const fakes = real.map((_) => line.getFakeIndex(_));
			return {
				lines: [line],
				cursors: fakes.map((index) => {
					return {line: 0, index};
				}),
			};
		}
	}
	length(str = this.str) {
		let i = 0;
		for (const char of str) {
			i++;
			if (char === "	") {
				i = Math.ceil(i / 8) * 8;
			}
		}
		return i;
	}
}
export {Line};
