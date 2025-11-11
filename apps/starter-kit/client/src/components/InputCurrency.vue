<template>
  <div class="form-wrapper-outer">
    <div id="input-wrapper" :class="field_wrapper">
      <input
        :ref="inputRef"
        :name="name"
        :id="inputUUID"
        :value="formattedValue"
        @input="handleInput"
        @blur="formatValue"
        @focus="unformatValue"
      />
      <div class="field-placeholder" @click="focus()">
        <span>{{ placeholder }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { v4 as uuidv4 } from "uuid";

export default {
  props: {
    name: { type: String, default: "" },
    input: { type: [String, Number], default: undefined },
    inputRef: { type: String, default: "" },
    placeholder: { type: String, default: "" },
    error: { type: Boolean, default: undefined },
  },
  data() {
    return {
      rawCents: "", // Store digits only, like '123'
    };
  },
  created() {
    this.rawCents = this.initialCentsFromInput(this.input);
  },
  computed: {
    inputUUID() {
      return uuidv4();
    },
    field_wrapper() {
      let classConcat = "";
      if (this.rawCents.length > 0) classConcat += "-hasValue";
      if (this.error === true) classConcat += "-error";
      return "field-wrapper" + classConcat;
    },
    formattedValue() {
      const value = this.parseFloatFromCents(this.rawCents);
      return value === null ? "" : this.formatCurrency(value);
    },
  },
  methods: {
    focus() {
      document.getElementById(this.inputUUID)?.focus();
    },
    handleInput(e) {
      const digits = e.target.value.replace(/\D/g, ""); // Keep only digits
      this.rawCents = digits;
    },
    formatCurrency(value) {
      return `AED ${value.toLocaleString("en-AE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    parseFloatFromCents(cents) {
      if (!cents) return null;
      return parseFloat((parseInt(cents, 10) / 100).toFixed(2));
    },
    initialCentsFromInput(input) {
      if (!input || isNaN(input)) return "";
      return Math.round(parseFloat(input) * 100).toString();
    },
    outputData() {
  const value = this.parseFloatFromCents(this.rawCents);
  const formatted = value !== null
    ? value.toFixed(2) // ensures string with 2 decimal places
    : "";

  this.$emit("output", { data: formatted });
}
  },
  watch: {
    rawCents() {
      this.outputData();
    },
    input(value) {
      this.rawCents = this.initialCentsFromInput(value);
    },
  },
};
</script>


<style>
[class^="field-wrapper"] {
  position: relative;
  margin-bottom: 5px;
}

[class^="field-wrapper"] input,
[class^="field-wrapper"] textarea,
[class^="field-wrapper"] ul {
  font-size: 1.25rem;
  line-height: 1.75rem;
  border: 1px solid #dadce0;
  padding: 15px;
  padding-left: 24px;
  border-radius: 4px;
  width: calc(100% - 39px);
  /* color: rgba(17, 85, 113, 1) !important; primary colour */
  border-color: #B2B2B2; /* primary colour */
}

[class*="-disabled"] input,
[class*="-disabled"] textarea {
  background-color: rgba(224, 224, 224, 1);
  cursor: not-allowed;
}

[class*="-error"] input,
[class*="-error"] textarea,
[class*="-error"] ul {
  box-shadow: 0 0 4px rgba(255, 5, 5, 1) !important;
  border-color: rgba(255, 5, 5, 1) !important;
}

[class^="field-wrapper"] input:focus,
[class^="field-wrapper"] textarea:focus,
[class^="field-wrapper"] ul:focus {
  outline: none !important;
  border: 1px solid #B2B2B2;
}

[class*="-error"] input:focus,
[class*="-error"] textarea:focus,
[class*="-error"] ul:focus {
  outline: none !important;
  border: 2px solid, rgba(255, 5, 5, 1);
}

[class*="-warning"] input:focus,
[class*="-warning"] textarea:focus,
[class*="-warning"] ul:focus {
  outline: none !important;
  border: 2px solid, rgba(255, 147, 5, 1);
}

[class^="field-wrapper"] .field-placeholder {
  font-size: 16px;
  position: absolute;
  /* background: #fff; */
  top: 19px;
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  color: #80868b;
  left: 8px;
  padding: 0 8px;
  -webkit-transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1);
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
  text-align: left;
  margin-left: 8px;
  cursor: text;
}

[class^="field-wrapper"] input:not([disabled]):focus ~ .field-placeholder,
[class^="field-wrapper"] textarea:not([disabled]):focus ~ .field-placeholder,
[class^="field-wrapper-hasValue"] .field-placeholder {
  -webkit-transform: translateY(-29px) scale(0.75) translateX(-15%);
  transform: translateY(-29px) scale(0.75) translateX(-15%);
  border: 1px solid #B2B2B2;;
  padding-top: 1px;
  padding-bottom: 2px;
  background: #ffffff;
  border-radius: 0.25rem;
  padding-left: 8px;
  padding-right: 8px;
  color: #80868b;
}

[class^="field-wrapper"] input:-webkit-autofill,
[class^="field-wrapper"] input:-webkit-autofill:hover,
[class^="field-wrapper"] input:-webkit-autofill:focus,
[class^="field-wrapper"] input:-webkit-autofill:active {
  -webkit-text-fill-color: #B2B2B2;
}

[class*="-disabled"] input:-webkit-autofill,
[class*="-disabled"] input:-webkit-autofill:hover,
[class*="-disabled"] input:-webkit-autofill:focus,
[class*="-disabled"] input:-webkit-autofill:active {
  -webkit-text-fill-color: #B2B2B2;
}
</style>