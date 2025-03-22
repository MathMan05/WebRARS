import {I18n} from "../i18n.js";
import {runTimeError} from "./emulator.js";
class RamStore {
	data: Uint32Array;
	text: Uint32Array;
	stack: Uint32Array;
	lengths: [number, number, number];
	constructor(ram: Ram) {
		this.data = this.trimNonZero(ram.data, ram.lengths[0]);
		this.text = this.trimNonZero(ram.text, ram.lengths[1]);
		this.stack = this.trimNonZero(ram.stack, ram.lengths[2]);
		this.lengths = [...ram.lengths];
	}
	trimNonZero(view: DataView, length: number) {
		let last = Math.ceil(length / 4);
		const arr = new Uint32Array(view.buffer);
		return new Uint32Array(arr.slice(0, last + 1).buffer);
	}
	trimStart(view: DataView, length: number) {
		let last = Math.ceil(length / 4);
		const arr = new Uint32Array(view.buffer);
		return new Uint32Array(arr.slice(last - 1 - arr.length).buffer);
	}
	toRam() {
		const data = new Uint32Array(new ArrayBuffer(1 << 22));
		for (const thing in this.data) {
			data[thing] = this.data[thing];
		}
		const text = new Uint32Array(new ArrayBuffer(1 << 22));
		for (const thing in this.text) {
			text[thing] = this.text[thing];
		}
		const stack = new Uint32Array(new ArrayBuffer(1 << 16));
		for (const thing in this.stack) {
			stack[thing] = this.stack[stack.length - +thing];
		}
		return new Ram(
			new DataView(data.buffer),
			new DataView(text.buffer),
			[...this.lengths],
			new DataView(stack.buffer),
		);
	}
}
class Ram {
	data: DataView;
	text: DataView;
	stack: DataView;
	lengths: [number, number, number];
	constructor(
		data: DataView,
		text: DataView,
		lengths: [number, number, number],
		stack = new DataView(new ArrayBuffer()),
	) {
		this.data = data;
		this.text = text;
		this.lengths = lengths;
		this.stack = stack;
		data.getInt32;
	}
	readFrom(val: number | bigint, read = true): ["data" | "text" | "stack", number] {
		val = Number(val);
		if (val >= 0x10010000 && val < 0x10010000 + this.data.byteLength) {
			if (!read && val - 0x10010000 > this.lengths[0]) {
				this.lengths[0] = val - 0x10010000;
			}
			return ["data", val - 0x10010000];
		} else if (val >= 0x00400000 && val < 0x00400000 + this.text.byteLength) {
			if (!read && val - 0x00400000 > this.lengths[1]) {
				this.lengths[1] = val - 0x00400000;
			}
			return ["text", val - 0x00400000];
		} else if (val >= 0x7fffeffc - this.stack.byteLength && val < 0x7fffeffc) {
			if (!read && val - 0x7fffeffc < this.lengths[2]) {
				this.lengths[1] = val - 0x7fffeffc;
			}
			return ["stack", val - 0x7fffeffc + this.stack.byteLength];
		} else {
			if (read) {
				throw new runTimeError(I18n.runTimeErrors.outOfBoundsRead(val.toString(16)));
			} else {
				throw new runTimeError(I18n.runTimeErrors.outOfBoundsWrite(val.toString(16)));
			}
		}
	}
	compact() {
		return new RamStore(this);
	}
	setFloat64(val: number | bigint, value: number) {
		const vals = this.readFrom(val);
		this[vals[0]].setFloat64(vals[1], value, true);
	}
	getFloat64(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getFloat64(vals[1], true);
	}
	setBigInt64(val: number | bigint, value: bigint | number) {
		const vals = this.readFrom(val);
		this[vals[0]].setBigInt64(vals[1], BigInt(value), true);
	}
	getBigInt64(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getBigInt64(vals[1], true);
	}
	getBigUint64(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getBigUint64(vals[1], true);
	}
	setFloat32(val: number | bigint, value: number) {
		const vals = this.readFrom(val);
		this[vals[0]].setFloat32(vals[1], value, true);
	}
	getFloat32(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getFloat32(vals[1], true);
	}
	setInt32(val: number | bigint, value: bigint | number) {
		const vals = this.readFrom(val);
		this[vals[0]].setInt32(vals[1], Number(value), true);
	}
	getInt32(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getInt32(vals[1], true);
	}
	getUint32(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getUint32(vals[1], true);
	}
	setInt16(val: number | bigint, value: bigint | number) {
		const vals = this.readFrom(val);
		this[vals[0]].setInt16(vals[1], Number(value), true);
	}
	getInt16(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getInt16(vals[1], true);
	}
	getUint16(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getUint16(vals[1], true);
	}
	setInt8(val: number | bigint, value: bigint | number) {
		const vals = this.readFrom(val);
		this[vals[0]].setInt8(vals[1], Number(value));
	}
	getInt8(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getInt8(vals[1]);
	}
	getUint8(val: number | bigint) {
		const vals = this.readFrom(val);
		return this[vals[0]].getUint8(vals[1]);
	}
}

export {Ram, RamStore};
