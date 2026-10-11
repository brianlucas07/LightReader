package com.example.lightreader

import org.junit.Test
import org.junit.Assert.*

class ExampleUnitTest {
    @Test
    fun addition_isCorrect() {
        assertEquals(4, 2 + 2)
    }

    @Test
    fun progressClamping_isAccurate() {
        fun clampProgress(percent: Int): Int = percent.coerceIn(0, 100)
        assertEquals(0, clampProgress(-5))
        assertEquals(50, clampProgress(50))
        assertEquals(100, clampProgress(120))
    }
}