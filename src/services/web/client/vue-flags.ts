/**
 * Flags de compilação do Vue (o build "esm-bundler" espera que o bundler as defina). O Vue só as lê ao criar a
 * aplicação, então basta defini-las antes do `createApp`: este módulo é importado primeiro no main.tsx.
 */
Object.assign(globalThis, {
	__VUE_OPTIONS_API__: false,
	__VUE_PROD_DEVTOOLS__: false,
	__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
})
