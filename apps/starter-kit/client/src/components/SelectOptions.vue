<template>
  <div>
    <div @click="selectOption(option)" class="option-container" v-for="option in options">
      <div  :class="optionCircle(option)">
        <div :class="innerOptionCircle(option)">

        </div>
      </div>
      <div :class="optionDescription(option)">
        {{ option.description }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    options: {
      type: Array,
      default: [],
    },
  },
  data() {
    return {
      selectedOption: undefined
    }
  },
  methods: {
    optionCircle(val) {
      if (val === this.selectedOption) {
        return 'option-circle-active'
      }
      else if (val.active === false) {
        return 'option-circle-blocked'
      }
      else {
        return 'option-circle'
      }
    },
    optionDescription(val) {
      if (val.active === true) {
        return 'option-description'
      } else {
        return 'option-description-inactive'
      }
    },
    innerOptionCircle(val) {
      if (val === this.selectedOption) {
        return 'inner-option-circle-active'
      }
      else {
        return ''
      }
    },
    selectOption(val) {
      if(val.active === true) {
      this.selectedOption = val
      this.$emit("output", val.description);
      }
      else {
        return;
      }
    }
  }
}
</script>