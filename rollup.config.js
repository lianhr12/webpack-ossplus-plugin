import typescript from "rollup-plugin-typescript2";
import dts from "rollup-plugin-dts";
import { terser } from 'rollup-plugin-terser';
// 支持require引入模块
import commonjs from '@rollup/plugin-commonjs';
// 默认情况下rollup.js不支持导入json模块
import json from '@rollup/plugin-json'

export default [
  // 编译TS文件为UMD模块标准
  {
    input: "lib/index.ts",
    output: {
      file: "dist/index.umd.js",
      format: "umd",
      name: 'webpackossplusplugin'
    },
    plugins: [
      json(),
      commonjs({
        namedExports: {'tslib': ['__awaiter', '__generator']}
     }),
      typescript(),
      terser()
    ]
  },
  // 编译TS文件为CJS模块标准
  {
    input: "lib/index.ts",
    output: {
      file: "dist/index.cjs.js",
      format: "cjs",
    },
    plugins: [
      json(),
      commonjs({
        namedExports: {'tslib': ['__awaiter', '__generator']}
     }),
      typescript()
    ]
  },
  // 编译TS文件为ES Module模块
  {
    input: "lib/index.ts",
    output: {
      file: "dist/index.mjs",
      format: "es" //这里的es指的就是将源码编译成esmodule规范的文件
    },
    plugins: [
      json(),
      commonjs({
        namedExports: {'tslib': ['__awaiter', '__generator']}
     }),
      typescript(),
    ]
  },
  // 编译输出.d.ts声明文件
  {
    input: "lib/index.ts",
    output: {
      file: "dist/index.d.ts",
    },
    plugins: [
      dts()
    ]
  }
]